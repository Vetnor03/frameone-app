import { buildOpenMeteoUrl, fetchOpenMeteoJson } from './openMeteo'
import type { ForecastCacheDebug } from './forecastCache'

export type CachedWeatherForecastResult<T = unknown> = {
  payload: T | null
  debug: ForecastCacheDebug
  error: string | null
  fetchedAt: string | null
  expiresAt: string | null
}

export type WeatherForecastFetchOptions = {
  lat: number
  lon: number
  timeoutMs: number
  forecastDays?: number
  frameRequest?: boolean
  configUpdatedAt?: string | number | Date | null
  fetcher?: typeof fetch
}

export type WeatherMarineFetchOptions = WeatherForecastFetchOptions

const WEATHER_FORECAST_DAYS = 5
const WEATHER_FORECAST_MIN_DAYS = 1
const WEATHER_FORECAST_MAX_DAYS = 7
const WEATHER_TIMEZONE = 'auto'

const WEATHER_CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'weather_code',
  'relative_humidity_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'precipitation',
]

const WEATHER_HOURLY_FIELDS = [
  'temperature_2m',
  'weather_code',
  'wind_speed_10m',
  'precipitation_probability',
  'precipitation',
]

const WEATHER_DAILY_FIELDS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'weather_code',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'sunrise',
  'sunset',
  'uv_index_max',
]

function clampWeatherForecastDays(forecastDays: number | null | undefined) {
  if (!Number.isFinite(forecastDays)) return WEATHER_FORECAST_DAYS
  return Math.max(WEATHER_FORECAST_MIN_DAYS, Math.min(WEATHER_FORECAST_MAX_DAYS, Math.round(Number(forecastDays))))
}

export function buildWeatherForecastUrl(lat: number, lon: number, forecastDays = WEATHER_FORECAST_DAYS) {
  const safeForecastDays = clampWeatherForecastDays(forecastDays)
  return buildOpenMeteoUrl({
    endpoint: 'forecast',
    lat,
    lon,
    current: WEATHER_CURRENT_FIELDS,
    hourly: WEATHER_HOURLY_FIELDS,
    daily: WEATHER_DAILY_FIELDS,
    forecastDays: safeForecastDays,
    timezone: WEATHER_TIMEZONE,
    params: {
      temperature_unit: 'celsius',
      wind_speed_unit: 'ms',
      precipitation_unit: 'mm',
    },
  })
}

export function buildWeatherMarineUrl(lat: number, lon: number) {
  return buildOpenMeteoUrl({
    endpoint: 'marine',
    lat,
    lon,
    hourly: ['sea_surface_temperature'],
    forecastDays: 1,
    timezone: WEATHER_TIMEZONE,
  })
}

export async function fetchWeatherForecast<T = unknown>(options: WeatherForecastFetchOptions): Promise<CachedWeatherForecastResult<T>> {
  const forecastDays = clampWeatherForecastDays(options.forecastDays)
  return fetchOpenMeteoJson<T>({
    dataType: 'weather',
    endpoint: 'forecast',
    lat: options.lat,
    lon: options.lon,
    current: WEATHER_CURRENT_FIELDS,
    hourly: WEATHER_HOURLY_FIELDS,
    daily: WEATHER_DAILY_FIELDS,
    params: {
      temperature_unit: 'celsius',
      wind_speed_unit: 'ms',
      precipitation_unit: 'mm',
    },
    timeoutMs: options.timeoutMs,
    forecastDays,
    forecastRange: `0-${forecastDays}d`,
    timezone: WEATHER_TIMEZONE,
    frameRequest: !!options.frameRequest,
    allowStale: true,
    configUpdatedAt: options.configUpdatedAt ?? null,
    fetcher: options.fetcher,
  })
}

export async function fetchWeatherMarine<T = unknown>(options: WeatherMarineFetchOptions): Promise<CachedWeatherForecastResult<T>> {
  return fetchOpenMeteoJson<T>({
    dataType: 'weather',
    endpoint: 'marine',
    lat: options.lat,
    lon: options.lon,
    hourly: ['sea_surface_temperature'],
    timeoutMs: options.timeoutMs,
    forecastDays: 1,
    forecastRange: '0-1d-marine',
    timezone: WEATHER_TIMEZONE,
    frameRequest: !!options.frameRequest,
    allowStale: true,
    configUpdatedAt: options.configUpdatedAt ?? null,
    fetcher: options.fetcher,
  })
}
