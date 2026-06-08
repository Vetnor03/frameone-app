import { NextResponse } from 'next/server'
import { fetchWeatherForecast, fetchWeatherMarine } from '@/app/lib/server/weatherForecast'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WEATHER_DETAILS_TIMEOUT_MS = 8000
const WEATHER_DETAILS_FORECAST_DAYS = 7

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

export async function GET(req: Request) {
  const url = new URL(req.url)
  const lat = numericParam(url, 'lat')
  const lon = numericParam(url, 'lon')
  if (lat == null || lon == null) {
    return NextResponse.json({ error: 'lat and lon are required' }, { status: 400 })
  }

  const forecastDays = forecastDaysParam(url)
  const framePayload = url.searchParams.get('frame') === '1'

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
    return NextResponse.json(weather.payload)
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
