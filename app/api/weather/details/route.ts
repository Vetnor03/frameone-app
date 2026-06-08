import { NextResponse } from 'next/server'
import { fetchWeatherForecast, fetchWeatherMarine } from '@/app/lib/server/weatherForecast'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WEATHER_DETAILS_TIMEOUT_MS = 8000
const WEATHER_DETAILS_FORECAST_DAYS = 7

type WeatherPrecipDebugPeriod = 'current' | 'morning' | 'noon' | 'evening'

function weatherDetailNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function weatherDetailArrayNumberAt(value: unknown, index: number): number | null {
  return Array.isArray(value) ? weatherDetailNumber(value[index]) : null
}

function weatherDetailArrayRawAt(value: unknown, index: number): unknown {
  return Array.isArray(value) ? value[index] : null
}

function weatherDetailDateKey(value: unknown) {
  const text = String(value || '')
  return text.includes('T') ? text.slice(0, 10) : text
}

function weatherDetailHour(value: unknown) {
  const match = String(value || '').match(/T(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  return Number.isFinite(hour) ? hour : null
}

function weatherDetailPeriodIndexes(hourlyTimes: unknown[], dateKey: string, startHour: number, endHour: number) {
  return hourlyTimes.reduce<number[]>((indexes, time, index) => {
    if (weatherDetailDateKey(time) !== dateKey) return indexes
    const hour = weatherDetailHour(time)
    if (hour == null || hour < startHour || hour > endHour) return indexes
    indexes.push(index)
    return indexes
  }, [])
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function weatherPrecipDisplayedMmValue(mm: number | null | undefined) {
  if (mm == null) return null
  const n = Number(mm)
  if (!Number.isFinite(n)) return null
  return n > 0 && n < 0.1 ? 0.1 : Number(n.toFixed(1))
}

function weatherPrecipDebugValues(hourlyPayload: Record<string, unknown>, indexes: number[]) {
  let precipProbability: number | null = null
  let precipMm = 0
  let hasPrecipMm = false
  const precipitationProbabilityValues: Array<number | null> = []
  const precipitationValues: Array<number | null> = []
  const rawPrecipitationValues: unknown[] = []
  const rainValues: Array<number | null> = []
  const showerValues: Array<number | null> = []

  indexes.forEach((index) => {
    const probability = weatherDetailArrayNumberAt(hourlyPayload.precipitation_probability, index)
    precipitationProbabilityValues.push(probability)
    if (probability != null) {
      precipProbability = precipProbability == null ? probability : Math.max(precipProbability, probability)
    }

    const rawPrecipitation = weatherDetailArrayRawAt(hourlyPayload.precipitation, index)
    rawPrecipitationValues.push(rawPrecipitation)

    const precipitation = weatherDetailNumber(rawPrecipitation)
    precipitationValues.push(precipitation)
    if (precipitation != null) {
      precipMm += precipitation
      hasPrecipMm = true
    }

    rainValues.push(weatherDetailArrayNumberAt(hourlyPayload.rain, index))
    showerValues.push(weatherDetailArrayNumberAt(hourlyPayload.showers, index))
  })

  return {
    precipitationProbabilityValues,
    precipitationValues,
    rawPrecipitationValues,
    rainValues,
    showerValues,
    rawDisplayedProbability: precipProbability,
    rawDisplayedPrecipitationMm: hasPrecipMm ? precipMm : null,
    displayedProbability: precipProbability == null ? null : Math.round(precipProbability),
    displayedPrecipitationMm: weatherPrecipDisplayedMmValue(hasPrecipMm ? precipMm : null),
  }
}

function logWeatherPrecipDebugPeriod(args: {
  context: Record<string, unknown>
  date: string
  period: WeatherPrecipDebugPeriod
  startHour: number | null
  endHour: number | null
  hoursIncluded: Array<{ index: number; time: unknown; hour: number | null }>
  hourlyPayload: Record<string, unknown>
  indexes: number[]
  rawDisplayedPrecipitationMmOverride?: number | null
  rawPrecipitationValuesOverride?: unknown[]
  rawPrecipitationSumOverride?: number | null
  precipitationAggregationMethod?: string
}) {
  const values = weatherPrecipDebugValues(args.hourlyPayload, args.indexes)
  const rawDisplayedPrecipitationMm = args.rawDisplayedPrecipitationMmOverride ?? values.rawDisplayedPrecipitationMm
  const rawPrecipitationValues = args.rawPrecipitationValuesOverride ?? values.rawPrecipitationValues
  const rawPrecipitationSum = args.rawPrecipitationSumOverride ?? values.rawDisplayedPrecipitationMm

  console.log('[weather-precip-debug]', {
    ...args.context,
    date: args.date,
    period: args.period,
    startHour: args.startHour,
    endHour: args.endHour,
    hoursIncluded: args.hoursIncluded,

    precipitationProbabilityValues: values.precipitationProbabilityValues,
    precipitationValues: values.precipitationValues,
    rawPrecipitationValues,
    rawPrecipitationSum,
    rainValues: values.rainValues,
    showerValues: values.showerValues,

    probabilityAggregationMethod: 'max',
    precipitationAggregationMethod: args.precipitationAggregationMethod ?? 'sum',

    rawDisplayedProbability: values.rawDisplayedProbability,
    rawDisplayedPrecipitationMm,

    displayedProbability: values.displayedProbability,
    displayedPrecipitationMm: weatherPrecipDisplayedMmValue(rawDisplayedPrecipitationMm),
  })
}

function logWeatherPrecipDebug(weatherPayload: unknown, context: Record<string, unknown>) {
  const weather = recordFromUnknown(weatherPayload)
  const current = recordFromUnknown(weather.current)
  const hourlyPayload = recordFromUnknown(weather.hourly)
  const daily = recordFromUnknown(weather.daily)
  const hourlyTimes = Array.isArray(hourlyPayload.time) ? hourlyPayload.time : []
  const dailyTimes = Array.isArray(daily.time) ? daily.time : []
  const currentTime = String(current.time || '')
  const firstCurrentOrFutureIndex = currentTime ? hourlyTimes.findIndex((time: unknown) => String(time) >= currentTime) : -1
  const currentIndexes = firstCurrentOrFutureIndex >= 0 ? [firstCurrentOrFutureIndex] : []
  const currentHourlyPrecip = weatherPrecipDebugValues(hourlyPayload, currentIndexes).rawDisplayedPrecipitationMm
  const currentPrecipFallbackRaw = current.precipitation ?? null
  const currentPrecipFallback = weatherDetailNumber(currentPrecipFallbackRaw)
  const currentRawPrecipitationMm = currentHourlyPrecip ?? currentPrecipFallback
  const currentRawPrecipitationValues = currentHourlyPrecip == null && currentPrecipFallback != null ? [currentPrecipFallbackRaw] : undefined
  const currentPrecipitationAggregationMethod = currentHourlyPrecip == null && currentPrecipFallback != null ? 'current.precipitation fallback' : 'sum'

  logWeatherPrecipDebugPeriod({
    context: {
      ...context,
      currentTime: currentTime || null,
      currentPrecipitationField: currentPrecipFallback,
      hourlyPrecipitationFieldPresent: Array.isArray(hourlyPayload.precipitation),
      hourlyPrecipitationProbabilityFieldPresent: Array.isArray(hourlyPayload.precipitation_probability),
      hourlyRainFieldPresent: Array.isArray(hourlyPayload.rain),
      hourlyShowersFieldPresent: Array.isArray(hourlyPayload.showers),
    },
    date: weatherDetailDateKey(currentTime || hourlyTimes[firstCurrentOrFutureIndex] || ''),
    period: 'current',
    startHour: weatherDetailHour(hourlyTimes[firstCurrentOrFutureIndex]),
    endHour: weatherDetailHour(hourlyTimes[firstCurrentOrFutureIndex]),
    hoursIncluded: currentIndexes.map((index) => ({ index, time: hourlyTimes[index], hour: weatherDetailHour(hourlyTimes[index]) })),
    hourlyPayload,
    indexes: currentIndexes,
    rawDisplayedPrecipitationMmOverride: currentRawPrecipitationMm,
    rawPrecipitationValuesOverride: currentRawPrecipitationValues,
    rawPrecipitationSumOverride: currentRawPrecipitationMm,
    precipitationAggregationMethod: currentPrecipitationAggregationMethod,
  })

  const periodDefs: Array<{ period: WeatherPrecipDebugPeriod; startHour: number; endHour: number }> = [
    { period: 'morning', startHour: 6, endHour: 10 },
    { period: 'noon', startHour: 11, endHour: 15 },
    { period: 'evening', startHour: 17, endHour: 21 },
  ]

  dailyTimes.slice(0, 7).forEach((day) => {
    const date = weatherDetailDateKey(day)
    periodDefs.forEach((periodDef) => {
      const indexes = weatherDetailPeriodIndexes(hourlyTimes, date, periodDef.startHour, periodDef.endHour)
      logWeatherPrecipDebugPeriod({
        context,
        date,
        period: periodDef.period,
        startHour: periodDef.startHour,
        endHour: periodDef.endHour,
        hoursIncluded: indexes.map((index) => ({ index, time: hourlyTimes[index], hour: weatherDetailHour(hourlyTimes[index]) })),
        hourlyPayload,
        indexes,
      })
    })
  })
}

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

  if (weather?.payload) {
    logWeatherPrecipDebug(weather.payload, {
      forecastSource: 'open-meteo',
      endpoint: 'weather-details',
      lat,
      lon,
      forecastDays: WEATHER_DETAILS_FORECAST_DAYS,
      timezone: 'auto',
      fetchedAt: weather.fetchedAt,
      expiresAt: weather.expiresAt,
      cacheDebug: weather.debug,
    })
  }

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
