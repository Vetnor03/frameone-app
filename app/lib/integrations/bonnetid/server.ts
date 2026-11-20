import { getSupabaseAdmin } from '../spond/server'
import { bonnetidLocalToIso, normalizeIrnLocations, normalizeIrnPrayerRows, type BonnetidCity } from './normalize.mjs'

const PROVIDER = 'bonnetid' // Stable internal key for existing Reminders filters and frames
const API_BASE = 'https://disp-api.bonnetider.eu/rest/v1/'
const REFRESH_INTERVAL = 12 * 60 * 60 * 1000
const WINDOW_DAYS = 10

export class BonnetidError extends Error {
  constructor(public code: 'setup_required' | 'upstream_unavailable' | 'invalid_city' | 'no_times', message: string) {
    super(message)
    this.name = 'BonnetidError'
  }
}

function apiHeaders(): HeadersInit {
  const apiKey = process.env.IRN_API_KEY?.trim()
  const authorization = process.env.IRN_AUTHORIZATION?.trim()
  if (!apiKey || !authorization) {
    throw new BonnetidError('setup_required', 'IRN API-tilgang er ikke konfigurert på serveren.')
  }
  // Vercel sensitive environment variables only. Never forward these headers to clients or logs.
  return { apikey: apiKey, Authorization: authorization, Accept: 'application/json' }
}

async function apiGet(table: 'location_t' | 'prayertime', filters: Record<string, string>): Promise<unknown> {
  const url = new URL(table, API_BASE)
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value)
  let response: Response
  try {
    response = await fetch(url, {
      headers: apiHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    })
  } catch (error) {
    if (error instanceof BonnetidError) throw error
    throw new BonnetidError('upstream_unavailable', 'Kan ikke nå IRN akkurat nå. Prøv igjen senere.')
  }
  if (!response.ok) {
    throw new BonnetidError('upstream_unavailable',
      response.status === 401 || response.status === 403
        ? 'IRN avviste API-tilgangen. Kontroller serverens hemmelige variabler.'
        : 'IRN er midlertidig utilgjengelig. Prøv igjen senere.')
  }
  try {
    return await response.json()
  } catch {
    throw new BonnetidError('upstream_unavailable', 'IRN returnerte et ugyldig svar.')
  }
}

export async function getBonnetidCities(): Promise<BonnetidCity[]> {
  const cities = normalizeIrnLocations(await apiGet('location_t', {
    select: 'location_iso,fylke_name,location_name,prayer_method,asr_method',
    order: 'location_name.asc',
  }))
  if (!cities.length) throw new BonnetidError('upstream_unavailable', 'IRN returnerte ingen støttede lokasjoner.')
  return cities
}

function osloYmd(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const value = (name: string) => parts.find(part => part.type === name)?.value || ''
  return value('year') + '-' + value('month') + '-' + value('day')
}

function upcomingDates() {
  const dates: string[] = []
  const start = osloYmd()
  for (let day = 0; day < WINDOW_DAYS; day++) {
    const date = new Date(start + 'T12:00:00Z')
    date.setUTCDate(date.getUTCDate() + day)
    dates.push(date.toISOString().slice(0, 10))
  }
  return dates
}

async function officialPrayerSchedule(city: BonnetidCity) {
  const dates = upcomingDates()
  // PostgREST range filters fetch all ten days in ONE request, rather than one request per day.
  const response = await apiGet('prayertime', {
    select: 'date,location_iso,prayer_method,fajr,duhr,asr,maghrib,isha',
    and: '(date.gte.' + dates[0] + ',date.lte.' + dates[dates.length - 1] + ')',
    location_iso: 'eq.' + city.id,
    prayer_method: 'eq.' + city.prayerMethod,
    order: 'date.asc',
  })
  const prayers = normalizeIrnPrayerRows(response, city, dates)
  if (prayers.length < 5 || !prayers.some(item => item.date === dates[0])) {
    throw new BonnetidError('no_times', 'IRN har ikke komplette bønnetider for denne lokasjonen i dag.')
  }
  return prayers
}


export async function getBonnetidStatus(userId: string) {
  const { data, error } = await getSupabaseAdmin().from('user_integrations')
    .select('status,external_account_id,external_account_label,last_sync_at,last_error')
    .eq('user_id', userId).eq('provider', PROVIDER).maybeSingle()
  if (error) throw new Error(error.message)
  return {
    connected: data?.status === 'connected',
    city: data?.external_account_label || null,
    cityId: data?.external_account_id || null,
    lastSyncAt: data?.last_sync_at || null,
    error: data?.last_error || null,
  }
}

export async function refreshBonnetidForUser(userId: string, chosenCity?: BonnetidCity) {
  const db = getSupabaseAdmin()
  let city = chosenCity
  if (!city) {
    const { data, error } = await db.from('user_integrations')
      .select('encrypted_credentials,status').eq('user_id', userId).eq('provider', PROVIDER).maybeSingle()
    if (error) throw new Error(error.message)
    if (data?.status !== 'connected') return { connected: false }
    const cityId = String(data.encrypted_credentials?.city?.id ?? '')
    // Re-read IRN's current official prayer method; it may change with the provider.
    city = (await getBonnetidCities()).find(entry => entry.id === cityId)
    if (!city) throw new BonnetidError('invalid_city', 'Velg lokasjon på nytt i IRN-integrasjonen.')
  }
  if (!/^NO[0-9]{4}$/.test(city.id) || ![2, 3].includes(city.prayerMethod)) {
    throw new BonnetidError('invalid_city', 'Velg en gyldig IRN-lokasjon.')
  }
  const prayers = await officialPrayerSchedule(city)
  const now = new Date().toISOString()
  const rows = prayers.map(prayer => ({
    user_id: userId,
    provider: PROVIDER,
    external_id: city.id + ':' + prayer.date + ':' + prayer.name.toLowerCase(),
    title: prayer.name,
    body: null,
    starts_at: bonnetidLocalToIso(prayer.date, prayer.time),
    due_at: null,
    priority: 5,
    raw: {
      source: PROVIDER, type: 'prayer_time', date: prayer.date, time: prayer.time,
      location_iso: city.id, prayer_method: city.prayerMethod, asr_method: city.asrMethod,
    },
    updated_at: now,
  })).filter(row => row.starts_at !== null)
  if (rows.length < 5) throw new BonnetidError('no_times', 'IRN returnerte ugyldige bønnetider.')
  // Keep official holiday/event items untouched until their separately documented import is ready.
  const previous = await db.from('integration_items').select('external_id,raw').eq('user_id', userId).eq('provider', PROVIDER)
  if (previous.error) throw new Error(previous.error.message)
  const upsert = await db.from('integration_items').upsert(rows, { onConflict: 'user_id,provider,external_id' })
  if (upsert.error) throw new Error(upsert.error.message)
  const updatedIds = new Set(rows.map(row => row.external_id))
  const staleIds = (previous.data || [])
    .filter(row => row.raw?.type === 'prayer_time')
    .map(row => row.external_id)
    .filter(id => !updatedIds.has(id))
  if (staleIds.length) {
    const removed = await db.from('integration_items').delete().eq('user_id', userId).eq('provider', PROVIDER).in('external_id', staleIds)
    if (removed.error) throw new Error(removed.error.message)
  }
  const saved = await db.from('user_integrations').upsert({
    user_id: userId,
    provider: PROVIDER,
    status: 'connected',
    encrypted_credentials: { city },
    external_account_id: city.id,
    external_account_label: city.name,
    last_sync_at: now,
    last_success_at: now,
    last_error: null,
    last_error_at: null,
    last_error_code: null,
    updated_at: now,
  }, { onConflict: 'user_id,provider' })
  if (saved.error) throw new Error(saved.error.message)
  return { connected: true, city: city.name, itemCount: rows.length }
}

export async function connectBonnetidForUser(userId: string, cityId: string) {
  const city = (await getBonnetidCities()).find(entry => entry.id === cityId)
  if (!city) throw new BonnetidError('invalid_city', 'Velg en lokasjon fra IRN-listen.')
  return refreshBonnetidForUser(userId, city)
}

export async function syncBonnetidIfStale(userId: string) {
  const status = await getBonnetidStatus(userId)
  if (!status.connected) return status
  const lastSync = status.lastSyncAt ? Date.parse(status.lastSyncAt) : 0
  if (Number.isFinite(lastSync) && Date.now() - lastSync < REFRESH_INTERVAL) return status
  return refreshBonnetidForUser(userId)
}

export async function disconnectBonnetidForUser(userId: string) {
  const db = getSupabaseAdmin()
  const items = await db.from('integration_items').delete().eq('user_id', userId).eq('provider', PROVIDER)
  if (items.error) throw new Error(items.error.message)
  const integration = await db.from('user_integrations').delete().eq('user_id', userId).eq('provider', PROVIDER)
  if (integration.error) throw new Error(integration.error.message)
  return { connected: false }
}
