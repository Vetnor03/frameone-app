// app/lib/surf/logExperience.ts
import { scoreSurf } from '../surfScoring'

export type Sideswell = {
  present: boolean
  height_m: number
  direction_deg_from: number
  period_s: number
}

export type MarineBundle = {
  time_utc: string
  primary: Sideswell
  secondary: Sideswell
  wind_speed_ms: number
  wind_direction_deg_from: number
}

type MarineSeries = {
  mt: string[]
  wt: string[]
  pH: number[]
  pD: number[]
  pP: number[]
  sH: number[]
  sD: number[]
  sP: number[]
  windS: number[]
  windD: number[]
}

export type ChosenSurfConditions = {
  time_utc: string
  wave_dir_from_deg: number
  wave_height_m: number
  wave_period_s: number
  wind_dir_from_deg: number
  wind_speed_ms: number
  picked: 'primary' | 'secondary'
}

const SECONDARY_MIN_M = 0.05

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function toNum(x: any) {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 12000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ac.signal, cache: 'no-store' })
  } finally {
    clearTimeout(t)
  }
}

function floorToUtcHour(d: Date) {
  const x = new Date(d)
  x.setUTCMinutes(0, 0, 0)
  return x
}

function isoHourUTC(d: Date) {
  return floorToUtcHour(d).toISOString().slice(0, 13) + ':00'
}

function nearestHourIndex(times: string[], targetIsoHour: string) {
  const exact = times.indexOf(targetIsoHour)
  if (exact >= 0) return exact

  const targetMs = Date.parse(targetIsoHour + ':00Z')
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY

  for (let i = 0; i < times.length; i++) {
    const ms = Date.parse(times[i] + ':00Z')
    const dist = Math.abs(ms - targetMs)
    if (dist < bestDist) {
      best = i
      bestDist = dist
    }
  }

  return best
}

export function getUtcHourRange(when: Date) {
  const start = floorToUtcHour(when)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return { start, end }
}

async function fetchMarineSeriesAtTime(lat: number, lon: number, when: Date): Promise<MarineSeries> {
  const targetHour = isoHourUTC(when)

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}` +
    `&longitude=${lon}` +
    `&hourly=` +
    `wave_height,wave_direction,wave_period,` +
    `secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period` +
    `&timezone=UTC` +
    `&past_days=7` +
    `&forecast_days=16`

  const windUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}` +
    `&longitude=${lon}` +
    `&hourly=wind_speed_10m,wind_direction_10m` +
    `&timezone=UTC` +
    `&wind_speed_unit=ms` +
    `&past_days=7` +
    `&forecast_days=16`

  const [marineResp, windResp] = await Promise.all([
    fetchWithTimeout(marineUrl, {}, 12000),
    fetchWithTimeout(windUrl, {}, 12000),
  ])

  if (!marineResp.ok) throw new Error(`Marine fetch failed (${marineResp.status})`)
  if (!windResp.ok) throw new Error(`Wind fetch failed (${windResp.status})`)

  const marine: any = await marineResp.json()
  const wind: any = await windResp.json()

  const mt: string[] = Array.isArray(marine?.hourly?.time) ? marine.hourly.time : []
  const wt: string[] = Array.isArray(wind?.hourly?.time) ? wind.hourly.time : []

  if (!mt.length) throw new Error('Marine data missing time')
  if (!wt.length) throw new Error('Wind data missing time')

  return {
    mt,
    wt,
    pH: Array.isArray(marine?.hourly?.wave_height) ? marine.hourly.wave_height.map(toNum) : [],
    pD: Array.isArray(marine?.hourly?.wave_direction) ? marine.hourly.wave_direction.map(toNum) : [],
    pP: Array.isArray(marine?.hourly?.wave_period) ? marine.hourly.wave_period.map(toNum) : [],
    sH: Array.isArray(marine?.hourly?.secondary_swell_wave_height)
      ? marine.hourly.secondary_swell_wave_height.map(toNum)
      : [],
    sD: Array.isArray(marine?.hourly?.secondary_swell_wave_direction)
      ? marine.hourly.secondary_swell_wave_direction.map(toNum)
      : [],
    sP: Array.isArray(marine?.hourly?.secondary_swell_wave_period)
      ? marine.hourly.secondary_swell_wave_period.map(toNum)
      : [],
    windS: Array.isArray(wind?.hourly?.wind_speed_10m) ? wind.hourly.wind_speed_10m.map(toNum) : [],
    windD: Array.isArray(wind?.hourly?.wind_direction_10m) ? wind.hourly.wind_direction_10m.map(toNum) : [],
  }
}

function makeBundleAtIndices(series: MarineSeries, mi: number, wi: number): MarineBundle {
  const safeMi = clampInt(mi, 0, series.mt.length - 1)
  const safeWi = clampInt(wi, 0, series.wt.length - 1)

  const pH = toNum(series.pH[safeMi])
  const pD = toNum(series.pD[safeMi])
  const pP = toNum(series.pP[safeMi])

  const sH = toNum(series.sH[safeMi])
  const sD = toNum(series.sD[safeMi])
  const sP = toNum(series.sP[safeMi])

  const secondaryPresent = sH >= SECONDARY_MIN_M

  return {
    time_utc: series.mt[safeMi],
    primary: {
      present: pH > 0.01,
      height_m: pH,
      direction_deg_from: pD,
      period_s: pP,
    },
    secondary: {
      present: secondaryPresent,
      height_m: secondaryPresent ? sH : 0,
      direction_deg_from: secondaryPresent ? sD : 0,
      period_s: secondaryPresent ? sP : 0,
    },
    wind_speed_ms: toNum(series.windS[safeWi]),
    wind_direction_deg_from: toNum(series.windD[safeWi]),
  }
}

function pickBestSwellForHour(spotKey: string, marine: MarineBundle) {
  const primaryScore = scoreSurf({
    spotKey,
    swellHeightM: marine.primary.height_m,
    swellPeriodS: marine.primary.period_s,
    swellDirDeg: marine.primary.direction_deg_from,
    windSpeedMs: marine.wind_speed_ms,
    windDirDeg: marine.wind_direction_deg_from,
  })

  if (!marine.secondary.present) {
    return { which: 'primary' as const, chosen: marine.primary }
  }

  const secondaryScore = scoreSurf({
    spotKey,
    swellHeightM: marine.secondary.height_m,
    swellPeriodS: marine.secondary.period_s,
    swellDirDeg: marine.secondary.direction_deg_from,
    windSpeedMs: marine.wind_speed_ms,
    windDirDeg: marine.wind_direction_deg_from,
  })

  if (secondaryScore.rating > primaryScore.rating) {
    return { which: 'secondary' as const, chosen: marine.secondary }
  }

  return { which: 'primary' as const, chosen: marine.primary }
}

export async function getChosenSurfConditionsAt(args: {
  spotKey: string
  lat: number
  lon: number
  when: Date
}): Promise<ChosenSurfConditions> {
  const { spotKey, lat, lon, when } = args

  const series = await fetchMarineSeriesAtTime(lat, lon, when)
  const targetHour = isoHourUTC(when)

  const mi = nearestHourIndex(series.mt, targetHour)
  const wi = nearestHourIndex(series.wt, targetHour)

  const marine = makeBundleAtIndices(series, mi, wi)
  const picked = pickBestSwellForHour(spotKey, marine)

  return {
    time_utc: marine.time_utc,
    wave_dir_from_deg: Number(picked.chosen.direction_deg_from),
    wave_height_m: Number(picked.chosen.height_m),
    wave_period_s: Number(picked.chosen.period_s),
    wind_dir_from_deg: Number(marine.wind_direction_deg_from),
    wind_speed_ms: Number(marine.wind_speed_ms),
    picked: picked.which,
  }
}