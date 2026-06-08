import { fetchCachedForecastJson, type ForecastCacheDataType, type ForecastCacheDebug } from './forecastCache'

export type OpenMeteoEndpoint = 'forecast' | 'marine'

export type OpenMeteoFetchOptions = {
  dataType: ForecastCacheDataType
  endpoint: OpenMeteoEndpoint
  lat: number
  lon: number
  timeoutMs: number
  current?: string[]
  hourly?: string[]
  daily?: string[]
  timezone?: string
  forecastDays?: number
  pastDays?: number
  horizonHours?: number
  forecastRange?: string
  frameRequest?: boolean
  allowStale?: boolean
  forceRefresh?: boolean
  configUpdatedAt?: string | number | Date | null
  fetcher?: typeof fetch
  params?: Record<string, string | number | boolean | null | undefined>
  cacheTtlMs?: number
}

export type OpenMeteoFetchResult<T = unknown> = {
  payload: T | null
  debug: ForecastCacheDebug
  error: string | null
  fetchedAt: string | null
  expiresAt: string | null
}

const OPEN_METEO_FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast'
const OPEN_METEO_MARINE_BASE = 'https://marine-api.open-meteo.com/v1/marine'

function setCsvParam(url: URL, key: 'current' | 'hourly' | 'daily', values?: string[]) {
  const clean = values?.map((value) => String(value).trim()).filter(Boolean) ?? []
  if (clean.length) url.searchParams.set(key, clean.join(','))
}

export function buildOpenMeteoUrl(options: Omit<OpenMeteoFetchOptions, 'dataType' | 'timeoutMs' | 'frameRequest' | 'allowStale' | 'forceRefresh' | 'configUpdatedAt' | 'fetcher' | 'cacheTtlMs'>) {
  const url = new URL(options.endpoint === 'marine' ? OPEN_METEO_MARINE_BASE : OPEN_METEO_FORECAST_BASE)
  url.searchParams.set('latitude', String(options.lat))
  url.searchParams.set('longitude', String(options.lon))
  setCsvParam(url, 'current', options.current)
  setCsvParam(url, 'hourly', options.hourly)
  setCsvParam(url, 'daily', options.daily)
  if (options.timezone) url.searchParams.set('timezone', options.timezone)
  if (options.forecastDays != null) url.searchParams.set('forecast_days', String(options.forecastDays))
  if (options.pastDays != null) url.searchParams.set('past_days', String(options.pastDays))
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value === null || value === undefined || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url
}

export async function fetchOpenMeteoJson<T = unknown>(options: OpenMeteoFetchOptions): Promise<OpenMeteoFetchResult<T>> {
  const url = buildOpenMeteoUrl(options).toString()
  return fetchCachedForecastJson<T>({
    dataType: options.dataType,
    provider: 'open-meteo',
    url,
    timeoutMs: options.timeoutMs,
    horizonHours: options.horizonHours,
    forecastDays: options.forecastDays,
    forecastRange: options.forecastRange,
    timezone: options.timezone,
    frameRequest: !!options.frameRequest,
    allowStale: options.allowStale,
    forceRefresh: options.forceRefresh,
    configUpdatedAt: options.configUpdatedAt ?? null,
    fetcher: options.fetcher,
    cacheTtlMs: options.cacheTtlMs,
  })
}
