import { NextResponse } from 'next/server'
import { fetchWeatherForecast, fetchWeatherMarine } from '@/app/lib/server/weatherForecast'
import { resolveWeatherInsight } from '@/app/lib/server/weatherInsight'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WEATHER_DETAILS_TIMEOUT_MS = 8000
const WEATHER_DETAILS_FORECAST_DAYS = 7
const FRAME_WEATHER_CURRENT_FIELDS = ['time', 'temperature_2m', 'relative_humidity_2m', 'weather_code'] as const
const FRAME_WEATHER_HOURLY_FIELDS = ['time', 'temperature_2m', 'apparent_temperature', 'weather_code', 'wind_speed_10m', 'wind_gusts_10m', 'precipitation_probability', 'precipitation'] as const
const FRAME_WEATHER_DAILY_FIELDS = ['time', 'temperature_2m_max', 'temperature_2m_min', 'weather_code', 'precipitation_sum', 'wind_speed_10m_max', 'sunrise', 'sunset'] as const

function numericParam(url: URL, key: string) {
  const value = Number(url.searchParams.get(key))
  return Number.isFinite(value) ? value : null
}

function forecastDaysParam(url: URL) {
  const rawValue = url.searchParams.get('days') ?? url.searchParams.get('forecast_days')
  if (rawValue == null || rawValue.trim() === '') return WEATHER_DETAILS_FORECAST_DAYS

  const value = Number(rawValue)
  if (!Number.isFinite(value)) return WEATHER_DETAILS_FORECAST_DAYS
  return Math.max(1, Math.min(WEATHER_DETAILS_FORECAST_DAYS, Math.round(value)))
}


function hasValue(source: unknown, field: string) {
  if (!source || typeof source !== 'object') return false
  const value = (source as Record<string, unknown>)[field]
  return value != null
}

function validateFields(source: unknown, fields: readonly string[], prefix: string) {
  return fields.filter((field) => !hasValue(source, field)).map((field) => `${prefix}.${field}`)
}

function validateFrameWeatherPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ['payload']
  const weather = payload as Record<string, unknown>
  return [
    ...validateFields(weather.current, FRAME_WEATHER_CURRENT_FIELDS, 'current'),
    ...validateFields(weather.daily, FRAME_WEATHER_DAILY_FIELDS, 'daily'),
    ...validateFields(weather.hourly, FRAME_WEATHER_HOURLY_FIELDS, 'hourly'),
  ]
}

function validateAppWeatherPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ['weather']
  const weather = payload as Record<string, unknown>
  return [
    ...validateFields(weather.current, ['time', 'temperature_2m', 'weather_code', 'relative_humidity_2m', 'wind_speed_10m', 'wind_direction_10m', 'precipitation'], 'weather.current'),
    ...validateFields(weather.daily, ['time', 'temperature_2m_max', 'temperature_2m_min', 'weather_code', 'precipitation_sum', 'wind_speed_10m_max', 'sunrise', 'sunset', 'uv_index_max'], 'weather.daily'),
    ...validateFields(weather.hourly, ['time', 'temperature_2m', 'weather_code', 'wind_speed_10m', 'precipitation_probability', 'precipitation', 'uv_index'], 'weather.hourly'),
  ]
}

function pickFields(source: unknown, fields: readonly string[]) {
  if (!source || typeof source !== 'object') return {}

  const compact: Record<string, unknown> = {}
  for (const field of fields) {
    if (field in source) compact[field] = (source as Record<string, unknown>)[field]
  }
  return compact
}

function compactFrameWeatherPayload(payload: unknown, compactVersion = 1, insight = '') {
  if (!payload || typeof payload !== 'object') return payload

  const weather = payload as Record<string, unknown>
  const hourly = pickFields(weather.hourly, FRAME_WEATHER_HOURLY_FIELDS)
  // Legacy frame firmware derives all forecast days from hourly arrays. Only
  // compact v2 firmware advertises daily-summary parsing and can safely receive
  // today's 24 hourly entries instead of the full 5-day hourly payload.
  if (compactVersion >= 2) {
    for (const field of FRAME_WEATHER_HOURLY_FIELDS) {
      const value = hourly[field]
      if (Array.isArray(value)) hourly[field] = value.slice(0, 24)
    }
  }

  return {
    insight,
    current: pickFields(weather.current, FRAME_WEATHER_CURRENT_FIELDS),
    daily: pickFields(weather.daily, FRAME_WEATHER_DAILY_FIELDS),
    hourly,
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const lat = numericParam(url, 'lat')
  const lon = numericParam(url, 'lon')
  if (lat == null || lon == null) {
    return NextResponse.json({ error: 'lat and lon are required' }, { status: 400 })
  }

  const forecastDays = forecastDaysParam(url)
  const framePayload = url.searchParams.get('frame') === '1'
  const frameCompactVersion = framePayload ? Number(url.searchParams.get('compact') || '1') : 0

  const weatherResult = await Promise.resolve(
    fetchWeatherForecast({ lat, lon, timeoutMs: WEATHER_DETAILS_TIMEOUT_MS, forecastDays, frameRequest: framePayload })
  ).then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (reason) => ({ status: 'rejected' as const, reason }),
  )
  const marineResult = framePayload
    ? ({ status: 'fulfilled' as const, value: null })
    : await Promise.resolve(fetchWeatherMarine({ lat, lon, timeoutMs: WEATHER_DETAILS_TIMEOUT_MS, frameRequest: false })).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason) => ({ status: 'rejected' as const, reason }),
    )

  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null
  const marine = marineResult.status === 'fulfilled' ? marineResult.value : null

  console.info('[weather-details]', {
    stage: 'open-meteo-cache',
    lat,
    lon,
    weather: weather?.debug ?? { error: weatherResult.status === 'rejected' ? String(weatherResult.reason) : 'unavailable' },
    marine: marine?.debug ?? { error: marineResult.status === 'rejected' ? String(marineResult.reason) : 'unavailable' },
  })

  if (!weather?.payload) {
    const error = weather?.error || (weatherResult.status === 'rejected' ? String(weatherResult.reason) : 'Weather unavailable')
    return NextResponse.json({ error }, { status: 503 })
  }

  if (framePayload) {
    const missingFields = validateFrameWeatherPayload(weather.payload)
    if (missingFields.length) {
      console.error('[weather-details]', { stage: 'invalid-frame-payload-shape', lat, lon, missingFields })
    }
    const insight = await resolveWeatherInsight(weather.payload)
    return NextResponse.json(compactFrameWeatherPayload(weather.payload, frameCompactVersion, insight))
  }

  const missingFields = validateAppWeatherPayload(weather.payload)
  if (missingFields.length) {
    console.error('[weather-details]', { stage: 'invalid-app-payload-shape', lat, lon, missingFields })
  }

  return NextResponse.json({
    weather: weather.payload,
    marine: marine?.payload ?? null,
    cache_debug: {
      weather: weather.debug,
      marine: marine?.debug ?? null,
    },
    fetched_at: {
      weather: weather.fetchedAt,
      marine: marine?.fetchedAt ?? null,
    },
    expires_at: {
      weather: weather.expiresAt,
      marine: marine?.expiresAt ?? null,
    },
  })
}
