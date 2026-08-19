// app/lib/surf/logExperience.ts
import { fetchOpenMeteoJson } from '../server/openMeteo'
import type { CustomSpotScoringProfile, UserSurfExperienceRecord } from '../surfScoring'
import {
  selectBestSurfSwell,
  type SurfMarineBundle,
  type SurfSwell,
} from './swellSelection'

export type Sideswell = SurfSwell
export type MarineBundle = SurfMarineBundle

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
  selected_swell_index: number
  condition_signature: {
    spotKey: string
    swells: Array<{ index: number; height_m: number; period_s: number; direction_deg_from: number }>
    wind_speed_ms: number
    wind_direction_deg_from: number
    forecast_time_utc?: string | null
    tide_m?: number | null
  }
}

const SECONDARY_MIN_M = 0.05

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function toNum(x: unknown) {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
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
  void when
  const [marineFetched, windFetched] = await Promise.all([
    fetchOpenMeteoJson({
      dataType: 'surf',
      endpoint: 'marine',
      lat,
      lon,
      hourly: [
        'wave_height',
        'wave_direction',
        'wave_period',
        'secondary_swell_wave_height',
        'secondary_swell_wave_direction',
        'secondary_swell_wave_period',
      ],
      timezone: 'UTC',
      pastDays: 7,
      forecastDays: 16,
      timeoutMs: 12000,
      forecastRange: 'past7-forecast16d',
      frameRequest: false,
      allowStale: true,
    }),
    fetchOpenMeteoJson({
      dataType: 'surf',
      endpoint: 'forecast',
      lat,
      lon,
      hourly: ['wind_speed_10m', 'wind_direction_10m'],
      timezone: 'UTC',
      pastDays: 7,
      forecastDays: 16,
      params: { wind_speed_unit: 'ms' },
      timeoutMs: 12000,
      forecastRange: 'past7-forecast16d',
      frameRequest: false,
      allowStale: true,
    }),
  ])

  if (!marineFetched.payload) throw new Error(`Marine fetch failed (${marineFetched.error || 'unavailable'})`)
  if (!windFetched.payload) throw new Error(`Wind fetch failed (${windFetched.error || 'unavailable'})`)

  const marine: any = marineFetched.payload
  const wind: any = windFetched.payload

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
  const secondaryPresent = sH >= SECONDARY_MIN_M && Number.isFinite(sD) && Number.isFinite(sP)

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

export async function getChosenSurfConditionsAt(args: {
  spotKey: string
  lat: number
  lon: number
  when: Date
  userExperiences?: UserSurfExperienceRecord[]
  customSpotProfile?: CustomSpotScoringProfile | null
}): Promise<ChosenSurfConditions> {
  const { spotKey, lat, lon, when, userExperiences, customSpotProfile } = args

  const series = await fetchMarineSeriesAtTime(lat, lon, when)
  const targetHour = isoHourUTC(when)
  const mi = nearestHourIndex(series.mt, targetHour)
  const wi = nearestHourIndex(series.wt, targetHour)

  const marine = makeBundleAtIndices(series, mi, wi)
  const picked = selectBestSurfSwell({
    spotKey,
    marine,
    userExperiences,
    customSpotProfile,
  })

  const fallbackSignature = {
    spotKey,
    swells: [
      {
        index: 1,
        height_m: Number(marine.primary.height_m),
        period_s: Number(marine.primary.period_s),
        direction_deg_from: Number(marine.primary.direction_deg_from),
      },
      ...(marine.secondary.present
        ? [{
            index: 2,
            height_m: Number(marine.secondary.height_m),
            period_s: Number(marine.secondary.period_s),
            direction_deg_from: Number(marine.secondary.direction_deg_from),
          }]
        : []),
    ],
    wind_speed_ms: Number(marine.wind_speed_ms),
    wind_direction_deg_from: Number(marine.wind_direction_deg_from),
    forecast_time_utc: marine.time_utc,
  }

  const conditionSignature = picked.combinedScore.breakdown?.swellMixSignature ?? fallbackSignature

  return {
    time_utc: marine.time_utc,
    wave_dir_from_deg: Number(picked.chosenSwell.direction_deg_from),
    wave_height_m: Number(picked.chosenSwell.height_m),
    wave_period_s: Number(picked.chosenSwell.period_s),
    wind_dir_from_deg: Number(marine.wind_direction_deg_from),
    wind_speed_ms: Number(marine.wind_speed_ms),
    picked: picked.chosen,
    selected_swell_index: picked.selectedSwellIndex,
    condition_signature: conditionSignature,
  }
}
