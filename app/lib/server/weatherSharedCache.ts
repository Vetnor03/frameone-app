import crypto from 'crypto'
import { createServiceClient } from '@/app/lib/supabase/serviceClient'
import { fetchWeatherForecast, type CachedWeatherForecastResult } from './weatherForecast'

// Frame forecast freshness is deliberately shorter than its three-hour
// Power Saver source wake. The scheduled backend job refreshes ahead of time.
export const WEATHER_PREFETCH_FRESH_MS = 2 * 60 * 60 * 1000 + 40 * 60 * 1000
export const WEATHER_LAST_GOOD_MAX_MS = 8 * 60 * 60 * 1000
const MAX_FORECAST_DAYS = 7

type SharedWeatherRow = { payload: unknown; fetched_at: string }

export function sharedWeatherCacheKey(lat: number, lon: number, forecastDays: number) {
  const days = Math.max(1, Math.min(MAX_FORECAST_DAYS, Math.round(forecastDays)))
  return crypto.createHash('sha256')
    .update(`weather:v1:${lat.toFixed(3)}:${lon.toFixed(3)}:${days}`)
    .digest('hex')
}

function usableForecast(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const forecast = payload as Record<string, any>
  return !!(
    forecast.current?.time &&
    forecast.current?.temperature_2m != null &&
    forecast.current?.weather_code != null &&
    Array.isArray(forecast.hourly?.time) && forecast.hourly.time.length &&
    Array.isArray(forecast.daily?.time) && forecast.daily.time.length
  )
}

function cachedResult<T>(row: SharedWeatherRow, key: string, ageMs: number, stale: boolean): CachedWeatherForecastResult<T> {
  const age = Math.max(0, ageMs)
  return {
    payload: row.payload as T,
    error: null,
    fetchedAt: row.fetched_at,
    expiresAt: new Date(Date.parse(row.fetched_at) + (stale ? WEATHER_LAST_GOOD_MAX_MS : WEATHER_PREFETCH_FRESH_MS)).toISOString(),
    debug: {
      cacheKey: `durable-weather:${key}`,
      cacheKeyHash: key.slice(0, 16),
      cacheKeyPrefix: 'durable-weather',
      cacheHit: true,
      cacheTier: 'long_range',
      cacheAgeMs: age,
      ttlMs: stale ? WEATHER_LAST_GOOD_MAX_MS : WEATHER_PREFETCH_FRESH_MS,
      staleUsed: stale,
      externalFetch: false,
      inFlightDeduped: false,
      forceRefresh: false,
      openMeteoUrl: '',
      openMeteoCacheStatus: stale ? 'stale' : 'hit',
      openMeteoCacheAgeMs: age,
      openMeteoCacheTtlMs: WEATHER_PREFETCH_FRESH_MS,
    },
  }
}

// Shared by physical frame requests and server-only prefetch. Different
// Vercel instances read the same forecast; there is no frame wake or redraw.
export async function fetchSharedFrameWeatherForecast<T = unknown>(
  options: { lat: number; lon: number; forecastDays?: number; timeoutMs?: number },
): Promise<CachedWeatherForecastResult<T>> {
  const { lat, lon } = options
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('invalid_weather_coordinates')
  }
  const forecastDays = Math.max(1, Math.min(MAX_FORECAST_DAYS, Math.round(options.forecastDays ?? 5)))
  const key = sharedWeatherCacheKey(lat, lon, forecastDays)
  const db = createServiceClient()

  const { data, error: readError } = await db
    .from('weather_forecast_cache')
    .select('payload, fetched_at')
    .eq('cache_key', key)
    .maybeSingle()
  if (readError) console.warn('[weather-shared] read failed', { code: readError.code })

  const row = data as SharedWeatherRow | null
  const fetchedAtMs = row ? Date.parse(row.fetched_at) : NaN
  const ageMs = Number.isFinite(fetchedAtMs) ? Math.max(0, Date.now() - fetchedAtMs) : Infinity
  if (row && usableForecast(row.payload) && ageMs < WEATHER_PREFETCH_FRESH_MS) {
    return cachedResult<T>(row, key, ageMs, false)
  }

  let fetched: CachedWeatherForecastResult<T>
  try {
    fetched = await fetchWeatherForecast<T>({
      lat, lon, forecastDays, timeoutMs: options.timeoutMs ?? 8000, frameRequest: true,
    })
  } catch (error) {
    console.warn('[weather-shared] live fetch threw', { reason: error instanceof Error ? error.message : 'unknown' })
    if (row && usableForecast(row.payload) && ageMs < WEATHER_LAST_GOOD_MAX_MS) {
      return cachedResult<T>(row, key, ageMs, true)
    }
    throw error
  }

  if (usableForecast(fetched.payload)) {
    // A process-memory hit may contain older data. Preserve the source timestamp
    // rather than resetting freshness every time the frame reads it.
    const sourceMs = fetched.fetchedAt ? Date.parse(fetched.fetchedAt) : NaN
    const now = Date.now()
    const safeSourceMs = Number.isFinite(sourceMs) && sourceMs <= now ? sourceMs : now
    const { error: writeError } = await db.from('weather_forecast_cache').upsert({
      cache_key: key,
      lat: Number(lat.toFixed(3)),
      lon: Number(lon.toFixed(3)),
      forecast_days: forecastDays,
      payload: fetched.payload,
      fetched_at: new Date(safeSourceMs).toISOString(),
    }, { onConflict: 'cache_key' })
    if (writeError) console.warn('[weather-shared] write failed', { code: writeError.code })
    return fetched
  }

  if (row && usableForecast(row.payload) && ageMs < WEATHER_LAST_GOOD_MAX_MS) {
    console.warn('[weather-shared] live unavailable: serving last good forecast', {
      age_ms: ageMs, upstream_error: fetched.error ?? 'invalid_payload',
    })
    return cachedResult<T>(row, key, ageMs, true)
  }
  return fetched
}
