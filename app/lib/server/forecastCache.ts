export type ForecastCacheDataType = 'weather' | 'surf'
export type ForecastCacheTier = 'immediate' | 'short_term' | 'long_range'

export type ForecastCacheDebug = {
  cacheKey: string
  cacheHit: boolean
  cacheTier: ForecastCacheTier
  cacheAgeMs: number | null
  ttlMs: number
  staleUsed: boolean
  externalFetch: boolean
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
  fetcher?: typeof fetch
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
const ONE_HOUR_MS = 60 * 60 * 1000
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000
const DEFAULT_STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FORECAST_CACHE_MAX_ENTRIES = 500
const FORECAST_CACHE_COORD_BUCKET_DEGREES = 0.05

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
  return (Math.round(n / FORECAST_CACHE_COORD_BUCKET_DEGREES) * FORECAST_CACHE_COORD_BUCKET_DEGREES).toFixed(2)
}

export function forecastCacheTier(input: { horizonHours?: number; forecastDays?: number; forecastRange?: string }): ForecastCacheTier {
  const horizonHours = Number(input.horizonHours)
  const forecastDays = Number(input.forecastDays)
  const range = String(input.forecastRange || '')
  if ((Number.isFinite(horizonHours) && horizonHours <= 2) || /(^|[^0-9])0\s*-\s*2h/i.test(range)) return 'immediate'
  if ((Number.isFinite(horizonHours) && horizonHours <= 48) || (Number.isFinite(forecastDays) && forecastDays <= 2) || /48h/i.test(range)) return 'short_term'
  return 'long_range'
}

export function forecastCacheTtlMs(input: { horizonHours?: number; forecastDays?: number; forecastRange?: string; frameRequest?: boolean }) {
  const tier = forecastCacheTier(input)
  const ttlMs = tier === 'immediate' ? FIFTEEN_MINUTES_MS : tier === 'short_term' ? ONE_HOUR_MS : TWELVE_HOURS_MS
  return input.frameRequest ? Math.max(ttlMs, FIFTEEN_MINUTES_MS) : ttlMs
}

export function forecastCacheKey(options: Pick<ForecastCacheOptions, 'dataType' | 'provider' | 'url' | 'timezone' | 'forecastRange'>) {
  const u = new URL(options.url)
  const lat = roundedCoord(u.searchParams.get('latitude'))
  const lon = roundedCoord(u.searchParams.get('longitude'))
  const normalizedParams = sortedParams(u)
    .filter(([key]) => key !== 'latitude' && key !== 'longitude')
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
  const timezone = options.timezone ?? u.searchParams.get('timezone') ?? ''
  const range = options.forecastRange ?? ''
  return [
    `type=${options.dataType}`,
    `provider=${options.provider}`,
    `host=${u.hostname}`,
    `path=${u.pathname}`,
    `grid=${lat},${lon}`,
    `timezone=${timezone}`,
    `range=${range}`,
    `params=${normalizedParams}`,
  ].join('|')
}

function pruneForecastCache(now = Date.now()) {
  for (const [key, entry] of __forecastResponseCache) {
    if (entry.staleExpiresAt <= now) __forecastResponseCache.delete(key)
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
  const ttlMs = forecastCacheTtlMs(options)
  const staleTtlMs = options.staleTtlMs ?? DEFAULT_STALE_TTL_MS
  pruneForecastCache(now)

  const cached = __forecastResponseCache.get(key) as ForecastCacheEntry<T> | undefined
  if (cached && cached.expiresAt > now) {
    const debug = { cacheKey: key, cacheHit: true, cacheTier: tier, cacheAgeMs: now - cached.fetchedAt, ttlMs, staleUsed: false, externalFetch: false }
    console.info('[forecast-cache]', debug)
    return { payload: cached.payload, debug, error: null, fetchedAt: new Date(cached.fetchedAt).toISOString(), expiresAt: new Date(cached.expiresAt).toISOString() }
  }

  const existing = __forecastResponseInFlight.get(key)
  if (existing) return existing as Promise<ForecastCacheFetchResult<T>>

  const promise = (async (): Promise<ForecastCacheFetchResult<T>> => {
    try {
      const payload = await fetchJsonWithTimeout(options.url, options.timeoutMs, options.fetcher) as T
      const fetchedAt = Date.now()
      const expiresAt = fetchedAt + ttlMs
      __forecastResponseCache.set(key, { fetchedAt, expiresAt, staleExpiresAt: fetchedAt + staleTtlMs, payload })
      pruneForecastCache(fetchedAt)
      const debug = { cacheKey: key, cacheHit: false, cacheTier: tier, cacheAgeMs: 0, ttlMs, staleUsed: false, externalFetch: true }
      console.info('[forecast-cache]', debug)
      return { payload, debug, error: null, fetchedAt: new Date(fetchedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString() }
    } catch (e: unknown) {
      const error = errorCode(e)
      if (options.allowStale !== false && cached && cached.staleExpiresAt > now) {
        const debug = { cacheKey: key, cacheHit: false, cacheTier: tier, cacheAgeMs: now - cached.fetchedAt, ttlMs, staleUsed: true, externalFetch: true }
        console.warn('[forecast-cache]', { ...debug, error })
        return { payload: cached.payload, debug, error, fetchedAt: new Date(cached.fetchedAt).toISOString(), expiresAt: new Date(cached.expiresAt).toISOString() }
      }
      const debug = { cacheKey: key, cacheHit: false, cacheTier: tier, cacheAgeMs: null, ttlMs, staleUsed: false, externalFetch: true }
      console.warn('[forecast-cache]', { ...debug, error })
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
  const effectiveTtlMs = ttlMs ?? forecastCacheTtlMs(options)
  __forecastResponseCache.set(key, {
    fetchedAt,
    expiresAt: fetchedAt + effectiveTtlMs,
    staleExpiresAt: fetchedAt + (staleTtlMs ?? DEFAULT_STALE_TTL_MS),
    payload,
  })
  return key
}
