import crypto from 'crypto'

export type ForecastCacheDataType = 'weather' | 'surf'
export type ForecastCacheTier = 'immediate' | 'short_term' | 'long_range'
export type OpenMeteoCacheStatus = 'hit' | 'miss' | 'stale' | 'deduped' | 'bypassed'

export type ForecastCacheDebug = {
  cacheKey: string
  cacheKeyHash: string
  cacheKeyPrefix: string
  cacheHit: boolean
  cacheTier: ForecastCacheTier
  cacheAgeMs: number | null
  ttlMs: number
  staleUsed: boolean
  externalFetch: boolean
  inFlightDeduped: boolean
  forceRefresh: boolean
  openMeteoUrl: string
  openMeteoCacheStatus: OpenMeteoCacheStatus
  openMeteoCacheAgeMs: number | null
  openMeteoCacheTtlMs: number
}

export type ForecastCacheFetchResult<T = unknown> = {
  payload: T | null
  debug: ForecastCacheDebug
  error: string | null
  fetchedAt: string | null
  expiresAt: string | null
}

type ForecastCacheEntry<T = unknown> = {
  fetchedAt: number
  expiresAt: number
  staleExpiresAt: number
  payload: T
}

type ForecastCacheOptions = {
  dataType: ForecastCacheDataType
  provider: string
  url: string
  timeoutMs: number
  horizonHours?: number
  forecastDays?: number
  forecastRange?: string
  timezone?: string | null
  frameRequest?: boolean
  allowStale?: boolean
  staleTtlMs?: number
  cacheTtlMs?: number
  fetcher?: typeof fetch
  forceRefresh?: boolean
  configUpdatedAt?: string | number | Date | null
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
const FORECAST_CACHE_MAX_ENTRIES = 500
// About 110m at the equator: conservative enough to merge truly nearby/custom
// duplicate points without moving weather/surf requests to a meaningfully different grid.
const FORECAST_CACHE_COORD_BUCKET_DEGREES = 0.001

type ForecastCacheGlobal = typeof globalThis & {
  __forecastResponseCache?: Map<string, ForecastCacheEntry>
  __forecastResponseInFlight?: Map<string, Promise<ForecastCacheFetchResult<unknown>>>
}

const forecastCacheGlobal = globalThis as ForecastCacheGlobal

const __forecastResponseCache: Map<string, ForecastCacheEntry> =
  forecastCacheGlobal.__forecastResponseCache || new Map<string, ForecastCacheEntry>()
forecastCacheGlobal.__forecastResponseCache = __forecastResponseCache

const __forecastResponseInFlight: Map<string, Promise<ForecastCacheFetchResult<unknown>>> =
  forecastCacheGlobal.__forecastResponseInFlight || new Map<string, Promise<ForecastCacheFetchResult<unknown>>>()
forecastCacheGlobal.__forecastResponseInFlight = __forecastResponseInFlight

function sortedParams(url: URL) {
  return Array.from(url.searchParams.entries()).sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv))
}

function roundedCoord(value: string | null) {
  const n = Number(value)
  if (!Number.isFinite(n)) return value ?? ''
  return (Math.round(n / FORECAST_CACHE_COORD_BUCKET_DEGREES) * FORECAST_CACHE_COORD_BUCKET_DEGREES).toFixed(3)
}

function normalizeParamValue(key: string, value: string) {
  if (key === 'hourly' || key === 'daily' || key === 'current') {
    return value.split(',').map((part) => part.trim()).filter(Boolean).sort().join(',')
  }
  return value
}

function parseTimeMs(value: ForecastCacheOptions['configUpdatedAt']) {
  if (value == null || value === '') return null
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(String(value))
  return Number.isFinite(ms) ? ms : null
}

export function forecastCacheTier(input: { horizonHours?: number; forecastDays?: number; forecastRange?: string }): ForecastCacheTier {
  const horizonHours = Number(input.horizonHours)
  const forecastDays = Number(input.forecastDays)
  const range = String(input.forecastRange || '')
  if ((Number.isFinite(horizonHours) && horizonHours <= 2) || /(^|[^0-9])0\s*-\s*2h/i.test(range)) return 'immediate'
  if ((Number.isFinite(horizonHours) && horizonHours <= 48) || (Number.isFinite(forecastDays) && forecastDays <= 2) || /48h/i.test(range)) return 'short_term'
  return 'long_range'
}

export function forecastCacheTtlMs(input?: { frameRequest?: boolean; configUnchangedSinceFetch?: boolean }) {
  return input?.frameRequest && input.configUnchangedSinceFetch ? FOUR_HOURS_MS : FIFTEEN_MINUTES_MS
}

export function forecastCacheKey(options: Pick<ForecastCacheOptions, 'dataType' | 'provider' | 'url' | 'timezone'>) {
  const u = new URL(options.url)
  const lat = roundedCoord(u.searchParams.get('latitude'))
  const lon = roundedCoord(u.searchParams.get('longitude'))
  const normalizedParams = sortedParams(u)
    .filter(([key]) => key !== 'latitude' && key !== 'longitude')
    .map(([key, value]) => `${key}=${normalizeParamValue(key, value)}`)
    .join('&')
  const timezone = options.timezone ?? u.searchParams.get('timezone') ?? ''
  return [
    `type=${options.dataType}`,
    `provider=${options.provider}`,
    `host=${u.hostname}`,
    `path=${u.pathname}`,
    `grid=${lat},${lon}`,
    `timezone=${timezone}`,
    `params=${normalizedParams}`,
  ].join('|')
}

function cacheKeyHash(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)
}

function cacheKeyPrefix(key: string) {
  return key.slice(0, 96)
}

function openMeteoUrlWithoutSecrets(url: string) {
  const u = new URL(url)
  return u.toString()
}

function isDailyOnlyOpenMeteoRequest(url: string) {
  const u = new URL(url)
  return !!u.searchParams.get('daily') && !u.searchParams.get('hourly') && !u.searchParams.get('current')
}

function ttlForEntry(options: ForecastCacheOptions, entry?: ForecastCacheEntry) {
  if (Number.isFinite(options.cacheTtlMs) && Number(options.cacheTtlMs) > 0) return Math.min(Number(options.cacheTtlMs), FOUR_HOURS_MS)
  if (entry) {
    const configUpdatedAt = parseTimeMs(options.configUpdatedAt)
    const configUnchangedSinceFetch = !!options.frameRequest && configUpdatedAt != null && configUpdatedAt <= entry.fetchedAt
    if (configUnchangedSinceFetch) return Math.min(forecastCacheTtlMs({ frameRequest: options.frameRequest, configUnchangedSinceFetch }), FOUR_HOURS_MS)
  }
  return isDailyOnlyOpenMeteoRequest(options.url) ? 2 * 60 * 60 * 1000 : FIFTEEN_MINUTES_MS
}

function makeDebug(input: {
  key: string
  options: ForecastCacheOptions
  tier: ForecastCacheTier
  status: OpenMeteoCacheStatus
  cacheHit: boolean
  cacheAgeMs: number | null
  ttlMs: number
  staleUsed: boolean
  externalFetch: boolean
  inFlightDeduped: boolean
}): ForecastCacheDebug {
  return {
    cacheKey: input.key,
    cacheKeyHash: cacheKeyHash(input.key),
    cacheKeyPrefix: cacheKeyPrefix(input.key),
    cacheHit: input.cacheHit,
    cacheTier: input.tier,
    cacheAgeMs: input.cacheAgeMs,
    ttlMs: input.ttlMs,
    staleUsed: input.staleUsed,
    externalFetch: input.externalFetch,
    inFlightDeduped: input.inFlightDeduped,
    forceRefresh: !!input.options.forceRefresh,
    openMeteoUrl: openMeteoUrlWithoutSecrets(input.options.url),
    openMeteoCacheStatus: input.status,
    openMeteoCacheAgeMs: input.cacheAgeMs,
    openMeteoCacheTtlMs: input.ttlMs,
  }
}

function requestedFields(url: string) {
  const u = new URL(url)
  return {
    current: u.searchParams.get('current') || null,
    hourly: u.searchParams.get('hourly') || null,
    daily: u.searchParams.get('daily') || null,
  }
}

function endpointLabel(url: string) {
  const u = new URL(url)
  return `${u.hostname}${u.pathname}`
}

function logForecastCache(level: 'info' | 'warn', debug: ForecastCacheDebug, extra: Record<string, unknown> = {}) {
  const logPayload = {
    cacheKeyHash: debug.cacheKeyHash,
    cacheKeyPrefix: debug.cacheKeyPrefix,
    status: debug.openMeteoCacheStatus,
    cacheKey: debug.cacheKey,
    endpoint: endpointLabel(debug.openMeteoUrl),
    requestedFields: requestedFields(debug.openMeteoUrl),
    ttlMs: debug.ttlMs,
    ageMs: debug.cacheAgeMs,
    inFlightDeduped: debug.inFlightDeduped,
    forceRefresh: debug.forceRefresh,
    url: debug.openMeteoUrl,
    ...extra,
  }
  if (level === 'warn') console.warn('[open-meteo-cache]', logPayload)
  else if (process.env.NODE_ENV !== 'production' || process.env.OPEN_METEO_DEBUG === '1' || debug.openMeteoCacheStatus !== 'hit') console.info('[open-meteo-cache]', logPayload)
}

function pruneForecastCache(now = Date.now()) {
  for (const [key, entry] of __forecastResponseCache) {
    if (entry.staleExpiresAt <= now || entry.fetchedAt + FOUR_HOURS_MS <= now) __forecastResponseCache.delete(key)
  }

  while (__forecastResponseCache.size > FORECAST_CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null
    let oldestFetchedAt = Number.POSITIVE_INFINITY
    for (const [key, entry] of __forecastResponseCache) {
      if (entry.fetchedAt < oldestFetchedAt) {
        oldestFetchedAt = entry.fetchedAt
        oldestKey = key
      }
    }
    if (!oldestKey) break
    __forecastResponseCache.delete(oldestKey)
  }
}

function errorCode(e: unknown) {
  const err = e as { code?: unknown; name?: unknown; message?: unknown; status?: unknown }
  if (err.code === 'timeout' || err.name === 'AbortError' || String(err.message ?? '').toLowerCase().includes('timeout')) return 'timeout'
  const status = Number(err.status)
  if (Number.isFinite(status)) return String(status)
  return String(err.message ?? 'fetch_error')
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number, fetcher: typeof fetch = fetch) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const resp = await fetcher(url, { signal: ac.signal, cache: 'no-store' })
    if (!resp.ok) {
      const err = new Error(String(resp.status))
      ;(err as Error & { status?: number }).status = resp.status
      throw err
    }
    return await resp.json()
  } catch (e: unknown) {
    if ((e as { name?: unknown }).name === 'AbortError') {
      const err = new Error('timeout')
      ;(err as Error & { code?: string }).code = 'timeout'
      throw err
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}

export async function fetchCachedForecastJson<T = unknown>(options: ForecastCacheOptions): Promise<ForecastCacheFetchResult<T>> {
  const now = Date.now()
  const key = forecastCacheKey(options)
  const tier = forecastCacheTier(options)
  pruneForecastCache(now)

  const cached = __forecastResponseCache.get(key) as ForecastCacheEntry<T> | undefined
  const ttlMs = ttlForEntry(options, cached)
  const cachedAgeMs = cached ? Math.max(0, now - cached.fetchedAt) : null
  const cachedFresh = !!cached && cachedAgeMs != null && cachedAgeMs <= ttlMs && cachedAgeMs < FOUR_HOURS_MS

  if (!options.forceRefresh && cached && cachedFresh) {
    const debug = makeDebug({ key, options, tier, status: 'hit', cacheHit: true, cacheAgeMs: cachedAgeMs, ttlMs, staleUsed: false, externalFetch: false, inFlightDeduped: false })
    logForecastCache('info', debug)
    return { payload: cached.payload, debug, error: null, fetchedAt: new Date(cached.fetchedAt).toISOString(), expiresAt: new Date(cached.fetchedAt + ttlMs).toISOString() }
  }

  const existing = __forecastResponseInFlight.get(key)
  if (existing) {
    const result = await existing as ForecastCacheFetchResult<T>
    const ageMs = result.fetchedAt ? Math.max(0, Date.now() - Date.parse(result.fetchedAt)) : result.debug.cacheAgeMs
    const debug = makeDebug({ key, options, tier, status: 'deduped', cacheHit: result.debug.cacheHit, cacheAgeMs: ageMs, ttlMs: result.debug.ttlMs || ttlMs, staleUsed: result.debug.staleUsed, externalFetch: false, inFlightDeduped: true })
    logForecastCache('info', debug)
    return { ...result, debug }
  }

  const promise = (async (): Promise<ForecastCacheFetchResult<T>> => {
    try {
      const status: OpenMeteoCacheStatus = options.forceRefresh ? 'bypassed' : cached ? 'stale' : 'miss'
      const payload = await fetchJsonWithTimeout(options.url, options.timeoutMs, options.fetcher) as T
      const fetchedAt = Date.now()
      const ttlMs = ttlForEntry(options)
      const expiresAt = fetchedAt + ttlMs
      __forecastResponseCache.set(key, { fetchedAt, expiresAt, staleExpiresAt: fetchedAt + FOUR_HOURS_MS, payload })
      pruneForecastCache(fetchedAt)
      const debug = makeDebug({ key, options, tier, status, cacheHit: false, cacheAgeMs: 0, ttlMs, staleUsed: false, externalFetch: true, inFlightDeduped: false })
      logForecastCache('info', debug)
      return { payload, debug, error: null, fetchedAt: new Date(fetchedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString() }
    } catch (e: unknown) {
      const error = errorCode(e)
      const staleAgeMs = cached ? Math.max(0, now - cached.fetchedAt) : null
      if (!options.forceRefresh && options.allowStale !== false && cached && staleAgeMs != null && staleAgeMs < FOUR_HOURS_MS) {
        const debug = makeDebug({ key, options, tier, status: 'stale', cacheHit: false, cacheAgeMs: staleAgeMs, ttlMs: FOUR_HOURS_MS, staleUsed: true, externalFetch: true, inFlightDeduped: false })
        logForecastCache('warn', debug, { error })
        return { payload: cached.payload, debug, error, fetchedAt: new Date(cached.fetchedAt).toISOString(), expiresAt: new Date(cached.fetchedAt + FOUR_HOURS_MS).toISOString() }
      }
      const debug = makeDebug({ key, options, tier, status: options.forceRefresh ? 'bypassed' : cached ? 'stale' : 'miss', cacheHit: false, cacheAgeMs: staleAgeMs, ttlMs: FIFTEEN_MINUTES_MS, staleUsed: false, externalFetch: true, inFlightDeduped: false })
      logForecastCache('warn', debug, { error })
      return { payload: null, debug, error, fetchedAt: null, expiresAt: null }
    }
  })()

  __forecastResponseInFlight.set(key, promise)
  try {
    return await promise
  } finally {
    __forecastResponseInFlight.delete(key)
  }
}

export function __resetForecastCacheForTests() {
  __forecastResponseCache.clear()
  __forecastResponseInFlight.clear()
}

export function __seedForecastCacheForTests<T = unknown>(options: ForecastCacheOptions, payload: T, fetchedAt: number, ttlMs?: number, staleTtlMs?: number) {
  const key = forecastCacheKey(options)
  const effectiveTtlMs = ttlMs ?? FIFTEEN_MINUTES_MS
  __forecastResponseCache.set(key, {
    fetchedAt,
    expiresAt: fetchedAt + effectiveTtlMs,
    staleExpiresAt: fetchedAt + Math.min(staleTtlMs ?? FOUR_HOURS_MS, FOUR_HOURS_MS),
    payload,
  })
  return key
}
