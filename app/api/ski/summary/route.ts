import { NextResponse } from 'next/server'

const MET_USER_AGENT = 'RE:MIND Ski/1.0 https://re-mind.no'
const OSLO_TIMEZONE = 'Europe/Oslo'
const NVE_GTS_BASE = 'https://gts.nve.no/api/GridTimeSeries'
const VARSOM_API_BASE = 'https://api01.nve.no/hydrology/forecast/avalanche/v6.3.2/api'
const VARSOM_WARNING_URL = 'https://www.varsom.no/snoskred/varsling/'

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

function avalancheDangerName(level: number | null, language: 'no' | 'en') {
  const namesNo: Record<number, string> = {
    0: 'Ikke vurdert',
    1: 'Liten',
    2: 'Moderat',
    3: 'Betydelig',
    4: 'Stor',
    5: 'Meget stor',
  }
  const namesEn: Record<number, string> = {
    0: 'Not assessed',
    1: 'Low',
    2: 'Moderate',
    3: 'Considerable',
    4: 'High',
    5: 'Very high',
  }
  if (level == null) return null
  return (language === 'no' ? namesNo : namesEn)[level] ?? null
}

function avalancheAspects(value: unknown, language: 'no' | 'en') {
  const mask = String(value || '').trim()
  if (!/^[01]{8}$/.test(mask)) return []
  const labels = language === 'no'
    ? ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV']
    : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return labels.filter((_, index) => mask[index] === '1')
}

function avalancheElevationLabel(problem: any, language: 'no' | 'en') {
  const height1 = finiteNumber(problem?.ExposedHeight1)
  const height2 = finiteNumber(problem?.ExposedHeight2)
  const fill = finiteNumber(problem?.ExposedHeightFill)
  const valid1 = height1 != null && height1 > 0 ? Math.round(height1) : null
  const valid2 = height2 != null && height2 > 0 ? Math.round(height2) : null

  if (valid1 == null && valid2 == null) return null
  if (fill === 1 && valid1 != null) return language === 'no' ? `Over ${valid1} m` : `Above ${valid1} m`
  if (fill === 2 && valid1 != null) return language === 'no' ? `Under ${valid1} m` : `Below ${valid1} m`

  if (valid1 != null && valid2 != null && valid1 !== valid2) {
    const low = Math.min(valid1, valid2)
    const high = Math.max(valid1, valid2)
    if (fill === 3) {
      return language === 'no' ? `Under ${low} m eller over ${high} m` : `Below ${low} m or above ${high} m`
    }
    if (fill === 4) {
      return language === 'no' ? `${low}–${high} m` : `${low}–${high} m`
    }
    return `${low}–${high} m`
  }

  const height = valid1 ?? valid2
  return height == null ? null : `${height} m`
}

function unavailableAvalanche(language: 'no' | 'en') {
  return {
    available: false,
    assessed: false,
    danger_level: null as number | null,
    danger_name: null as string | null,
    region_name: null as string | null,
    valid_from: null as string | null,
    main_text: null as string | null,
    problems: [] as Array<{
      name: string | null
      aspects: string[]
      elevation: string | null
      trigger: string | null
      size: string | null
    }>,
    full_warning_url: VARSOM_WARNING_URL,
    attribution: 'Varsler fra Snøskredvarslingen i Norge og www.varsom.no',
    language,
  }
}

async function loadVarsomAvalanche(latitude: number, longitude: number, language: 'no' | 'en') {
  const today = osloParts(new Date()).date
  const langKey = language === 'no' ? 1 : 2
  const url = `${VARSOM_API_BASE}/Warning/Coordinate/${latitude}/${longitude}/${langKey}/${today}/${today}`

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) return unavailableAvalanche(language)

    const payload = await response.json().catch(() => null)
    const warning = Array.isArray(payload) ? payload[0] ?? null : null
    if (!warning) return unavailableAvalanche(language)

    const dangerLevel = finiteNumber(warning?.DangerLevel)
    const rawProblems = Array.isArray(warning?.AvalancheProblems) ? warning.AvalancheProblems : []
    const problems = rawProblems.map((problem: any) => ({
      name: String(problem?.AvalancheProblemTypeName || problem?.AvalancheExtName || '').trim() || null,
      aspects: avalancheAspects(problem?.ValidExpositions, language),
      elevation: avalancheElevationLabel(problem, language),
      trigger: String(problem?.AvalTriggerSimpleName || problem?.AvalTriggerSensitivityName || '').trim() || null,
      size: String(problem?.DestructiveSizeExtName || '').trim() || null,
    }))

    return {
      available: true,
      assessed: dangerLevel != null && dangerLevel > 0,
      danger_level: dangerLevel,
      danger_name: avalancheDangerName(dangerLevel, language),
      region_name: String(warning?.RegionName || '').trim() || null,
      valid_from: String(warning?.ValidFrom || '').trim() || null,
      main_text: String(warning?.MainText || '').trim() || null,
      problems,
      full_warning_url: VARSOM_WARNING_URL,
      attribution: 'Varsler fra Snøskredvarslingen i Norge og www.varsom.no',
      language,
    }
  } catch {
    return unavailableAvalanche(language)
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
  const language: 'no' | 'en' = searchParams.get('lang') === 'no' ? 'no' : 'en'

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
  const avalanchePromise = loadVarsomAvalanche(lat, lon, language)
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
  const [snow, avalanche] = await Promise.all([snowPromise, avalanchePromise])

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
    avalanche,
    forecast: compactForecast(timeseries),
    sources: {
      weather: 'MET Norway',
      snow: 'NVE SeNorge',
      avalanche: 'Varsom / Snøskredvarslingen i Norge',
    },
  })
}
