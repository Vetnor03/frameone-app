import { NextResponse } from 'next/server'

const MET_USER_AGENT = 'RE:MIND Ski/1.0 https://re-mind.no'
const OSLO_TIMEZONE = 'Europe/Oslo'
const NVE_GTS_BASE = 'https://gts.nve.no/api/GridTimeSeries'

function finiteNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function roundCoordinate(value: number) {
  return Math.round(value * 10_000) / 10_000
}

function round1(value: number | null) {
  return value == null ? null : Math.round(value * 10) / 10
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

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function wgs84ToUtm33(latitude: number, longitude: number) {
  // EPSG:25833 (ETRS89 / UTM zone 33N). WGS84 and ETRS89 are effectively
  // identical at the precision required for SeNorge's roughly 1 km grid.
  const a = 6378137
  const f = 1 / 298.257222101
  const e2 = f * (2 - f)
  const ep2 = e2 / (1 - e2)
  const k0 = 0.9996
  const phi = latitude * Math.PI / 180
  const lambda = longitude * Math.PI / 180
  const lambda0 = 15 * Math.PI / 180
  const sinPhi = Math.sin(phi)
  const cosPhi = Math.cos(phi)
  const tanPhi = Math.tan(phi)
  const n = a / Math.sqrt(1 - e2 * sinPhi * sinPhi)
  const t = tanPhi * tanPhi
  const c = ep2 * cosPhi * cosPhi
  const aa = cosPhi * (lambda - lambda0)

  const m = a * (
    (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi)
  )

  const x = 500000 + k0 * n * (
    aa
    + (1 - t + c) * aa ** 3 / 6
    + (5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * aa ** 5 / 120
  )

  const y = k0 * (
    m
    + n * tanPhi * (
      aa ** 2 / 2
      + (5 - t + 9 * c + 4 * c ** 2) * aa ** 4 / 24
      + (61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * aa ** 6 / 720
    )
  )

  return { x: Math.round(x), y: Math.round(y) }
}

function normalizeSnowCentimeters(value: number | null, unitValue: unknown) {
  if (value == null) return null
  const unit = String(unitValue || '').trim().toLowerCase()
  if (unit === 'mm') return round1(value / 10)
  if (unit === 'm') return round1(value * 100)
  return round1(value)
}

type GtsThemeResult = {
  valueCm: number | null
  altitudeM: number | null
  endDate: string | null
}

async function fetchGtsSnowTheme(
  x: number,
  y: number,
  startDate: string,
  endDate: string,
  theme: 'sd' | 'sdfsw' | 'sdfsw3d'
): Promise<GtsThemeResult> {
  const url = `${NVE_GTS_BASE}/${x}/${y}/${startDate}/${endDate}/${theme}.json`

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) return { valueCm: null, altitudeM: null, endDate: null }

    const payload = await response.json().catch(() => null)
    const data = Array.isArray(payload?.Data) ? payload.Data : []
    const noData = finiteNumber(payload?.NoDataValue)
    let latest: number | null = null

    for (let index = data.length - 1; index >= 0; index -= 1) {
      const value = finiteNumber(data[index])
      if (value == null) continue
      if (noData != null && value === noData) continue
      latest = value
      break
    }

    return {
      valueCm: normalizeSnowCentimeters(latest, payload?.Unit),
      altitudeM: finiteNumber(payload?.Altitude),
      endDate: String(payload?.EndDate || '').trim() || null,
    }
  } catch {
    return { valueCm: null, altitudeM: null, endDate: null }
  }
}

async function loadSeNorgeSnow(latitude: number, longitude: number) {
  const { x, y } = wgs84ToUtm33(latitude, longitude)
  const endDate = osloParts(new Date()).date
  const startDate = shiftDate(endDate, -10)

  const [depth, fresh24h, fresh72h] = await Promise.all([
    fetchGtsSnowTheme(x, y, startDate, endDate, 'sd'),
    fetchGtsSnowTheme(x, y, startDate, endDate, 'sdfsw'),
    fetchGtsSnowTheme(x, y, startDate, endDate, 'sdfsw3d'),
  ])

  return {
    snow_depth_cm: depth.valueCm,
    fresh_24h_cm: fresh24h.valueCm,
    fresh_72h_cm: fresh72h.valueCm,
    altitude_m: depth.altitudeM ?? fresh24h.altitudeM ?? fresh72h.altitudeM,
    source_date: depth.endDate ?? fresh24h.endDate ?? fresh72h.endDate,
    grid: { x, y },
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
  const snowPromise = loadSeNorgeSnow(lat, lon)
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
  const snow = await snowPromise

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
    snow,
    forecast: compactForecast(timeseries),
    sources: {
      weather: 'MET Norway',
      snow: 'NVE SeNorge',
    },
  })
}
