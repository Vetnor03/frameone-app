import { NextResponse } from 'next/server'

const MET_USER_AGENT = 'RE:MIND Ski/1.0 https://re-mind.no'
const OSLO_TIMEZONE = 'Europe/Oslo'

function finiteNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function roundCoordinate(value: number) {
  return Math.round(value * 10_000) / 10_000
}

function osloParts(value: string | Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OSLO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(typeof value === 'string' ? new Date(value) : value)

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
  }
}

function compactForecast(timeseries: any[]) {
  const today = osloParts(new Date()).date
  const grouped = new Map<
    string,
    {
      temps: number[]
      precipitation: number
      representative: { score: number; symbol: string | null; wind: number | null; windDir: number | null }
    }
  >()

  for (const point of timeseries) {
    const time = String(point?.time || '')
    if (!time) continue

    const local = osloParts(time)
    if (!local.date || local.date <= today) continue

    const instant = point?.data?.instant?.details ?? {}
    const nextHour = point?.data?.next_1_hours ?? {}
    const temp = finiteNumber(instant.air_temperature)
    const precip = finiteNumber(nextHour?.details?.precipitation_amount)
    const symbol = String(nextHour?.summary?.symbol_code || point?.data?.next_6_hours?.summary?.symbol_code || '').trim() || null
    const wind = finiteNumber(instant.wind_speed)
    const windDir = finiteNumber(instant.wind_from_direction)

    const existing = grouped.get(local.date) || {
      temps: [],
      precipitation: 0,
      representative: { score: Number.POSITIVE_INFINITY, symbol: null, wind: null, windDir: null },
    }

    if (temp != null) existing.temps.push(temp)
    if (precip != null) existing.precipitation += precip

    const score = Math.abs(local.hour - 12)
    if (score < existing.representative.score) {
      existing.representative = { score, symbol, wind, windDir }
    }

    grouped.set(local.date, existing)
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 6)
    .map(([date, day]) => ({
      date,
      min_temp_c: day.temps.length ? Math.min(...day.temps) : null,
      max_temp_c: day.temps.length ? Math.max(...day.temps) : null,
      precipitation_mm: Math.round(day.precipitation * 10) / 10,
      symbol_code: day.representative.symbol,
      wind_mps: day.representative.wind,
      wind_dir_deg: day.representative.windDir,
    }))
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const latitude = Number(searchParams.get('lat'))
  const longitude = Number(searchParams.get('lon'))
  const label = String(searchParams.get('label') || '').trim().slice(0, 120)

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return NextResponse.json({ error: 'invalid_coordinates' }, { status: 400 })
  }

  const lat = roundCoordinate(latitude)
  const lon = roundCoordinate(longitude)
  const metUrl = new URL('https://api.met.no/weatherapi/locationforecast/2.0/compact')
  metUrl.searchParams.set('lat', String(lat))
  metUrl.searchParams.set('lon', String(lon))

  let response: Response
  try {
    response = await fetch(metUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': MET_USER_AGENT,
      },
      next: { revalidate: 600 },
    })
  } catch {
    return NextResponse.json({ error: 'met_request_failed' }, { status: 502 })
  }

  if (!response.ok) {
    return NextResponse.json({ error: 'met_request_failed' }, { status: 502 })
  }

  const payload = await response.json().catch(() => null)
  const timeseries = Array.isArray(payload?.properties?.timeseries) ? payload.properties.timeseries : []
  const point = timeseries[0] ?? null

  if (!point) {
    return NextResponse.json({ error: 'met_data_unavailable' }, { status: 502 })
  }

  const instant = point?.data?.instant?.details ?? {}
  const nextHour = point?.data?.next_1_hours?.details ?? {}

  return NextResponse.json({
    location: { label, lat, lon },
    generated_at: new Date().toISOString(),
    current: {
      temp_c: finiteNumber(instant.air_temperature),
      wind_mps: finiteNumber(instant.wind_speed),
      wind_dir_deg: finiteNumber(instant.wind_from_direction),
      gust_mps: finiteNumber(instant.wind_speed_of_gust),
      precipitation_1h_mm: finiteNumber(nextHour.precipitation_amount),
    },
    forecast: compactForecast(timeseries),
  })
}
