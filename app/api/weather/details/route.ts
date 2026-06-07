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

export async function GET(req: Request) {
  const url = new URL(req.url)
  const lat = numericParam(url, 'lat')
  const lon = numericParam(url, 'lon')
  if (lat == null || lon == null) {
    return NextResponse.json({ error: 'lat and lon are required' }, { status: 400 })
  }

  const [weatherResult, marineResult] = await Promise.allSettled([
    fetchWeatherForecast({ lat, lon, timeoutMs: WEATHER_DETAILS_TIMEOUT_MS, forecastDays: WEATHER_DETAILS_FORECAST_DAYS, frameRequest: false }),
    fetchWeatherMarine({ lat, lon, timeoutMs: WEATHER_DETAILS_TIMEOUT_MS, frameRequest: false }),
  ])

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
