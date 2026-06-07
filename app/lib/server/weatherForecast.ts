import { fetchCachedForecastJson, type ForecastCacheDebug } from './forecastCache'

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
  frameRequest?: boolean
  configUpdatedAt?: string | number | Date | null
  fetcher?: typeof fetch
}

export type WeatherMarineFetchOptions = WeatherForecastFetchOptions

const WEATHER_FORECAST_DAYS = 5
const WEATHER_TIMEZONE = 'auto'

export function buildWeatherForecastUrl(lat: number, lon: number) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('current', [
    'temperature_2m',
    'apparent_temperature',
    'weather_code',
    'relative_humidity_2m',
    'wind_speed_10m',
    'wind_direction_10m',
    'precipitation',
  ].join(','))
  url.searchParams.set('hourly', [
    'temperature_2m',
    'weather_code',
    'wind_speed_10m',
    'precipitation_probability',
    'precipitation',
  ].join(','))
  url.searchParams.set('daily', [
    'temperature_2m_max',
    'temperature_2m_min',
    'weather_code',
    'precipitation_sum',
    'precipitation_probability_max',
    'wind_speed_10m_max',
    'sunrise',
    'sunset',
    'uv_index_max',
  ].join(','))
  url.searchParams.set('forecast_days', String(WEATHER_FORECAST_DAYS))
  url.searchParams.set('temperature_unit', 'celsius')
  url.searchParams.set('wind_speed_unit', 'ms')
  url.searchParams.set('precipitation_unit', 'mm')
  url.searchParams.set('timezone', WEATHER_TIMEZONE)
  return url
}

export function buildWeatherMarineUrl(lat: number, lon: number) {
  const url = new URL('https://marine-api.open-meteo.com/v1/marine')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('hourly', 'sea_surface_temperature')
  url.searchParams.set('forecast_days', '1')
  url.searchParams.set('timezone', WEATHER_TIMEZONE)
  return url
}

export async function fetchWeatherForecast<T = unknown>(options: WeatherForecastFetchOptions): Promise<CachedWeatherForecastResult<T>> {
  return fetchCachedForecastJson<T>({
    dataType: 'weather',
    provider: 'open-meteo',
    url: buildWeatherForecastUrl(options.lat, options.lon).toString(),
    timeoutMs: options.timeoutMs,
    forecastDays: WEATHER_FORECAST_DAYS,
    forecastRange: '0-5d',
    timezone: WEATHER_TIMEZONE,
    frameRequest: !!options.frameRequest,
    allowStale: true,
    configUpdatedAt: options.configUpdatedAt ?? null,
    fetcher: options.fetcher,
  })
}

export async function fetchWeatherMarine<T = unknown>(options: WeatherMarineFetchOptions): Promise<CachedWeatherForecastResult<T>> {
  return fetchCachedForecastJson<T>({
    dataType: 'weather',
    provider: 'open-meteo',
    url: buildWeatherMarineUrl(options.lat, options.lon).toString(),
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
