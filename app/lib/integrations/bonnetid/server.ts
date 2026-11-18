import { getSupabaseAdmin } from '../spond/server'
import { bonnetidLocalToIso, normalizeBonnetidLocations, normalizeBonnetidMonth, type BonnetidCity, type BonnetidPrayer } from './normalize.mjs'

const PROVIDER = 'bonnetid'
const API_BASE = 'https://api.bonnetid.no'
const REFRESH_INTERVAL = 12 * 60 * 60 * 1000
const WINDOW_DAYS = 10

export class BonnetidError extends Error {
  constructor(public code: 'setup_required' | 'upstream_unavailable' | 'invalid_city' | 'no_times', message: string) {
    super(message)
    this.name = 'BonnetidError'
  }
}

function apiToken() {
  const token = process.env.BONNETID_API_TOKEN?.trim()
  if (!token) throw new BonnetidError('setup_required', 'Bønnetid is awaiting API access from Islamsk Råd Norge. Please try again later.')
  return token
}

async function apiGet(path: string) {
  const response = await fetch(API_BASE + path, {
    headers: { 'Api-Token': apiToken(), Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) {
    throw new BonnetidError('upstream_unavailable', response.status === 401 || response.status === 403
      ? 'Bønnetid API access has not been authorized.'
      : 'Bønnetid is temporarily unavailable. Please try again.')
  }
  return response.json()
}

export async function getBonnetidCities(): Promise<BonnetidCity[]> {
  const cities = normalizeBonnetidLocations(await apiGet('/meta/locations/'))
  if (!cities.length) throw new BonnetidError('upstream_unavailable', 'Bønnetid returned no supported cities.')
  return cities
}

function osloYmd(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const value = (name: string) => parts.find(part => part.type === name)?.value || ''
  return value('year') + '-' + value('month') + '-' + value('day')
}

function upcomingDates() {
  const start = osloYmd()
  const days = []
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const date = new Date(start + 'T12:00:00Z')
    date.setUTCDate(date.getUTCDate() + i)
    days.push(date.toISOString().slice(0, 10))
  }
  return days
}

async function officialPrayerSchedule(cityId: string) {
  const dates = upcomingDates()
  const uniqueMonths = [...new Set(dates.map(date => date.slice(0, 7)))]
  const monthlyResults = await Promise.allSettled(uniqueMonths.map(async month => {
    const [year, monthNumber] = month.split('-').map(Number)
    return normalizeBonnetidMonth(await apiGet('/meta/prayertimes/' + cityId + '/' + year + '/' + monthNumber + '/?asr=2'), year, monthNumber)
  }))
  const grouped = new Map<string, BonnetidPrayer[]>()
  for (const result of monthlyResults) if (result.status === 'fulfilled') for (const item of result.value) {
    const list = grouped.get(item.date) || []
    list.push(item)
    grouped.set(item.date, list)
  }
  // The public API exposes a monthly /prayertimes/ collection as an alternate
  // endpoint. Its trailing /{id}/ route is a record identifier, NOT a date.
  // Try the alternate monthly collection for any missing dates.
  const missingMonths = [...new Set(dates.filter(date => (grouped.get(date) || []).length !== 5).map(date => date.slice(0, 7)))]
  const alternateMonths = await Promise.allSettled(missingMonths.map(async month => {
    const [year, monthNumber] = month.split('-').map(Number)
    return normalizeBonnetidMonth(await apiGet('/prayertimes/' + cityId + '/' + year + '/' + monthNumber + '/'), year, monthNumber)
  }))
  for (const result of alternateMonths) if (result.status === 'fulfilled') {
    for (const item of result.value) {
      const list = grouped.get(item.date) || []
      if (list.length !== 5) list.push(item)
      grouped.set(item.date, list)
    }
  }
  const prayers = dates.flatMap(date => grouped.get(date) || [])
  if (prayers.length < 5 || !grouped.has(dates[0])) throw new BonnetidError('no_times', 'Official prayer times are not available for this city right now.')
  return prayers
}

export async function getBonnetidStatus(userId: string) {
  const { data, error } = await getSupabaseAdmin().from('user_integrations')
    .select('status,external_account_id,external_account_label,last_sync_at,last_error')
    .eq('user_id', userId).eq('provider', PROVIDER).maybeSingle()
  if (error) throw new Error(error.message)
  return { connected: data?.status === 'connected', city: data?.external_account_label || null, cityId: data?.external_account_id || null, lastSyncAt: data?.last_sync_at || null, error: data?.last_error || null }
}

export async function refreshBonnetidForUser(userId: string, chosenCity?: BonnetidCity) {
  const db = getSupabaseAdmin()
  let city = chosenCity
  if (!city) {
    const { data, error } = await db.from('user_integrations')
      .select('encrypted_credentials,status').eq('user_id', userId).eq('provider', PROVIDER).maybeSingle()
    if (error) throw new Error(error.message)
    if (data?.status !== 'connected') return { connected: false }
    const saved = data.encrypted_credentials?.city
    if (!saved) return { connected: false }
    city = { id: String(saved.id), name: String(saved.name) }
  }
  if (!/^\d{1,8}$/.test(city.id)) throw new BonnetidError('invalid_city', 'Select a city from the list.')
  const prayers = await officialPrayerSchedule(city.id)
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
    raw: { source: PROVIDER, type: 'prayer_time', date: prayer.date, time: prayer.time, city_id: city.id },
    updated_at: now,
  })).filter(row => row.starts_at !== null)
  if (rows.length < 5) throw new BonnetidError('no_times', 'Bønnetid returned invalid times.')
  const previous = await db.from('integration_items').select('external_id').eq('user_id', userId).eq('provider', PROVIDER)
  if (previous.error) throw new Error(previous.error.message)
  const upsert = await db.from('integration_items').upsert(rows, { onConflict: 'user_id,provider,external_id' })
  if (upsert.error) throw new Error(upsert.error.message)
  const updatedIds = new Set(rows.map(row => row.external_id))
  const staleIds = (previous.data || []).map(row => row.external_id).filter(id => !updatedIds.has(id))
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
  const cities = await getBonnetidCities()
  const city = cities.find(entry => entry.id === cityId)
  if (!city) throw new BonnetidError('invalid_city', 'Select a city from the official list.')
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
