import { getSupabaseAdmin } from '../spond/server'
import { aladhanCoordinatesUrl, normalizeAladhan, safeCity, METHODS } from './preview.mjs'
import { resolveNorwegianCity, type NorwegianPlace } from './location.mjs'
import { followingDays, osloWallClockToIso } from './time.mjs'
import { getAladhanHolidayDates } from './holidays.mjs'

const PROVIDER = 'aladhan'
const UPSTREAM_CACHE_SECONDS = 6 * 60 * 60
const REFRESH_MS = 12 * 60 * 60 * 1000
const DAYS = 7

export type AladhanSelection = {
  city: string
  asrMethod: 1 | 2
  method: number
  highLatitude: number
}
export class AladhanIntegrationError extends Error {
  constructor(public code: 'invalid_configuration' | 'upstream_unavailable' | 'invalid_timetable', message: string) {
    super(message)
    this.name = 'AladhanIntegrationError'
  }
}
export function validateAladhanSelection(input: unknown): AladhanSelection {
  const obj = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const city = safeCity(obj.city)
  const asrMethod = Number(obj.asrMethod)
  const method = obj.method == null ? 3 : Number(obj.method)
  const highLatitude = obj.highLatitude == null ? 3 : Number(obj.highLatitude)
  if (!city || (asrMethod !== 1 && asrMethod !== 2) ||
      !METHODS.includes(method) || ![1, 2, 3].includes(highLatitude)) {
    throw new AladhanIntegrationError('invalid_configuration', 'Choose a Norwegian city, Asr method and calculation settings.')
  }
  return { city, asrMethod: asrMethod as 1 | 2, method, highLatitude }
}
async function officialProviderCalculatedDay(date: string, selection: AladhanSelection, location: NorwegianPlace) {
  // This is calculated AlAdhan data, NOT official IRN timetable data.
  const url = aladhanCoordinatesUrl({ ...selection, date, latitude: location.latitude, longitude: location.longitude })
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: UPSTREAM_CACHE_SECONDS },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new AladhanIntegrationError('upstream_unavailable', 'AlAdhan returned HTTP ' + response.status)
  const payload: unknown = await response.json()
  try {
    return normalizeAladhan(payload, { city: location.name, date, asrMethod: selection.asrMethod, method: selection.method, coordinates: location })
  } catch (error) {
    console.warn('[aladhan] Invalid upstream timetable', date, error instanceof Error ? error.message : 'unknown')
    throw new AladhanIntegrationError('invalid_timetable', 'Could not verify AlAdhan prayer times for ' + date + '. Try a different method or city.')
  }
}
export async function getAladhanStatus(userId: string) {
  const { data, error } = await getSupabaseAdmin().from('user_integrations')
    .select('status,external_account_label,encrypted_credentials,last_sync_at,last_error')
    .eq('user_id', userId).eq('provider', PROVIDER).maybeSingle()
  if (error) throw new Error(error.message)
  const cfg = data?.encrypted_credentials
  return {
    connected: data?.status === 'connected',
    city: data?.external_account_label || null,
    asrMethod: cfg?.asrMethod === 2 ? 2 : 1,
    method: Number(cfg?.method) || 3,
    highLatitude: Number(cfg?.highLatitude) || 3,
    lastSyncAt: data?.last_sync_at || null,
    error: data?.last_error || null,
  }
}

export async function refreshAladhanForUser(userId: string, chosen?: AladhanSelection) {
  const db = getSupabaseAdmin()
  let selection = chosen
  if (!selection) {
    const { data, error } = await db.from('user_integrations')
      .select('status,encrypted_credentials').eq('user_id', userId).eq('provider', PROVIDER).maybeSingle()
    if (error) throw new Error(error.message)
    if (data?.status !== 'connected') return { connected: false }
    selection = validateAladhanSelection(data.encrypted_credentials)
  } else selection = validateAladhanSelection(selection)
  let location: NorwegianPlace
  try {
    location = await resolveNorwegianCity(selection.city)
  } catch (error) {
    throw new AladhanIntegrationError('invalid_configuration',
      error instanceof Error ? error.message : 'Could not locate this Norwegian city.')
  }
  const dates = followingDays(DAYS)
  // Fail closed: do not replace any stored timetable with a partial or
  // unverified response. The upstream cache reuses identical city/method/day calls.
  let days: Awaited<ReturnType<typeof officialProviderCalculatedDay>>[]
  try {
    days = await Promise.all(dates.map(date => officialProviderCalculatedDay(date, selection, location)))
  } catch (err) {
    if (err instanceof AladhanIntegrationError) throw err
    throw new AladhanIntegrationError('upstream_unavailable', 'AlAdhan is temporarily unavailable. Your existing schedule is unchanged.')
  }
  const now = new Date().toISOString()
  const timingNames = new Set(['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Sunset', 'Maghrib', 'Isha'])
  const timingRows = days.flatMap(day => day.times.filter(item => timingNames.has(item.name)).map(item => ({
    user_id: userId,
    provider: PROVIDER,
    external_id: selection.city.toLocaleLowerCase('nb-NO') + ':' + day.date + ':' + item.name.toLowerCase(),
    title: item.name === 'Sunrise' ? 'Soloppgang' : item.name === 'Sunset' ? 'Solnedgang' : item.name,
    body: null,
    starts_at: osloWallClockToIso(day.date, item.time),
    due_at: null,
    priority: 5,
    raw: { source: PROVIDER, type: 'prayer_time', date: day.date, time: item.time, calculated: true,
      method: selection.method, asr_method: selection.asrMethod, high_latitude: selection.highLatitude },
    updated_at: now,
  })))
  if (timingRows.length !== DAYS * 7 || timingRows.some(row => !row.starts_at))
    throw new AladhanIntegrationError('invalid_timetable', 'AlAdhan returned an incomplete timetable. Nothing was changed.')

  // Separate, all-day Islamic observances. Their dates are calculated by the
  // provider, may differ from locally announced dates, and are not mosque events.
  // Failure to convert holiday dates must never block the verified timetable.
  const observances = await getAladhanHolidayDates(days[0]?.hijri?.date || '', dates[0])
    .catch(() => ({ dates: [], complete: false }))
  const holidayRows = observances.dates.map(item => ({
    user_id: userId,
    provider: PROVIDER,
    external_id: 'hijri:' + item.year + ':' + item.key,
    title: item.title,
    body: 'Beregnet dato – kan avvike fra lokale kunngjøringer.',
    starts_at: osloWallClockToIso(item.date, '12:00'),
    due_at: null,
    priority: 5,
    raw: { source: PROVIDER, type: 'islamic_holiday', date: item.date,
      hijri_date: item.hijriDate, key: item.key, calculated: true, all_day: true },
    updated_at: now,
  }))
  const rows = [...timingRows, ...holidayRows]
  if (rows.some(row => !row.starts_at))
    throw new AladhanIntegrationError('invalid_timetable', 'Invalid AlAdhan holiday date. Nothing was changed.')

  const previous = await db.from('integration_items')
    .select('external_id,raw').eq('user_id', userId).eq('provider', PROVIDER)
  if (previous.error) throw new Error(previous.error.message)
  const saved = await db.from('integration_items').upsert(rows, { onConflict: 'user_id,provider,external_id' })
  if (saved.error) throw new Error(saved.error.message)
  const next = new Set(rows.map(row => row.external_id))
  const stale = (previous.data || []).filter(row => row.raw?.type === 'prayer_time' ||
    (observances.complete && row.raw?.type === 'islamic_holiday')).map(row => row.external_id)
    .filter(id => !next.has(id))
  if (stale.length) {
    const removed = await db.from('integration_items').delete().eq('user_id', userId)
      .eq('provider', PROVIDER).in('external_id', stale)
    if (removed.error) throw new Error(removed.error.message)
  }
  const updated = await db.from('user_integrations').upsert({
    user_id: userId, provider: PROVIDER, status: 'connected',
    encrypted_credentials: selection,
    external_account_id: selection.city.toLocaleLowerCase('nb-NO'),
    external_account_label: selection.city,
    last_sync_at: now, last_success_at: now, last_error: null, last_error_at: null,
    last_error_code: null, updated_at: now,
  }, { onConflict: 'user_id,provider' })
  if (updated.error) throw new Error(updated.error.message)
  return { connected: true, city: selection.city, asrMethod: selection.asrMethod,
    method: selection.method, highLatitude: selection.highLatitude, itemCount: rows.length }
}

export async function connectAladhanForUser(userId: string, input: unknown) {
  return refreshAladhanForUser(userId, validateAladhanSelection(input))
}
export async function syncAladhanIfStale(userId: string) {
  const status = await getAladhanStatus(userId)
  if (!status.connected) return status
  const last = status.lastSyncAt ? Date.parse(status.lastSyncAt) : 0
  if (Number.isFinite(last) && last > 0 && Date.now() - last < REFRESH_MS) return status
  return refreshAladhanForUser(userId)
}
export async function disconnectAladhanForUser(userId: string) {
  const db = getSupabaseAdmin()
  const { error: itemsError } = await db.from('integration_items').delete().eq('user_id', userId).eq('provider', PROVIDER)
  if (itemsError) throw new Error(itemsError.message)
  const { error: connectionError } = await db.from('user_integrations').delete().eq('user_id', userId).eq('provider', PROVIDER)
  if (connectionError) throw new Error(connectionError.message)
  return { connected: false }
}
