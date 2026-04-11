// app/api/surf/score/route.ts  (FULL FILE - copy/paste)
import { NextResponse } from 'next/server'
import { SURF_SPOTS, findSpotByLabel } from '@/app/lib/surf/spots'
import { scoreSurf, type UserSurfExperienceRecord } from '@/app/lib/surfScoring'
import TABLES from '@/app/lib/surf/waveguide_tables.json'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TODAYS_BEST_LABEL = "Today's Best"
const TODAYS_BEST_ID = '__todays_best__'

// Dayparts: computed only when ?dayparts=1 (Large module)
const DAYPARTS_TZ = 'Europe/Oslo'
const DAYPART_TARGETS: Array<{ label: 'Morning' | 'Noon' | 'Afternoon' | 'Evening'; hourLocal: number }> = [
  { label: 'Morning', hourLocal: 8 },
  { label: 'Noon', hourLocal: 12 },
  { label: 'Afternoon', hourLocal: 16 },
  { label: 'Evening', hourLocal: 20 },
]

// Daily (XL): computed only when ?daily=1 (and days<=5)
const DAILY_TZ = 'Europe/Oslo'

// ------------------------------
// Response headers (avoid stale / caching weirdness)
// ------------------------------
function jsonNoStore(payload: any, init?: { status?: number }) {
  return NextResponse.json(payload, {
    status: init?.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}

// ------------------------------
// Fetch with timeout (prevents hanging on cold start)
// ------------------------------
async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 12000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } finally {
    clearTimeout(t)
  }
}

// ------------------------------
// Sunrise / Sunset (Open-Meteo) — cached
// ------------------------------
type SunTimes = { sunrise: string; sunset: string }

const SUN_CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

const __sunCache =
  (globalThis as any).__surfSunCache || new Map<string, { exp: number; v: SunTimes }>()
;(globalThis as any).__surfSunCache = __sunCache

function hhmmFromIsoLocal(iso: any): string {
  const s = String(iso ?? '')
  const t = s.indexOf('T')
  if (t < 0) return '--:--'
  const hh = s.slice(t + 1, t + 3)
  const mm = s.slice(t + 4, t + 6)
  if (hh.length !== 2 || mm.length !== 2) return '--:--'
  return `${hh}:${mm}`
}

function sunCacheKey(lat: number, lon: number) {
  const r = (n: number) => Math.round(n * 1e4) / 1e4
  const day = new Date().toISOString().slice(0, 10)
  return `sun|${r(lat)},${r(lon)}|${day}`
}

async function fetchSunTimes(lat: number, lon: number): Promise<SunTimes> {
  const key = sunCacheKey(lat, lon)
  const now = Date.now()
  const cached = __sunCache.get(key)
  if (cached && cached.exp > now) return cached.v

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}` +
    `&longitude=${lon}` +
    `&daily=sunrise,sunset` +
    `&forecast_days=1` +
    `&timezone=${encodeURIComponent('Europe/Oslo')}`

  const resp = await fetchWithTimeout(url, {}, 12000)
  if (!resp.ok) throw new Error('Sunrise/sunset fetch failed')

  const j: any = await resp.json()
  const sunriseIso = j?.daily?.sunrise?.[0]
  const sunsetIso = j?.daily?.sunset?.[0]

  const v: SunTimes = {
    sunrise: hhmmFromIsoLocal(sunriseIso),
    sunset: hhmmFromIsoLocal(sunsetIso),
  }

  __sunCache.set(key, { exp: now + SUN_CACHE_TTL_MS, v })
  return v
}

// ------------------------------
// Daily "extras" for XL (air min/max + main weather + sunrise/sunset) — cached
// ------------------------------
type DailyExtras = {
  sun: { sunrise: string; sunset: string }
  air: { temp_min_c: number | null; temp_max_c: number | null }
  weather: { code: number | null; main: string }
  temp_c: number | null
  weather_label: string
}

const WX_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const __wxCache =
  (globalThis as any).__surfWxCache || new Map<string, { exp: number; v: DailyExtras }>()
;(globalThis as any).__surfWxCache = __wxCache

function wxCacheKey(lat: number, lon: number) {
  const r = (n: number) => Math.round(n * 1e4) / 1e4
  const day = new Date().toISOString().slice(0, 10)
  return `wx|${r(lat)},${r(lon)}|${day}`
}

function weatherMainFromCode(code: number | null): 'Sunny' | 'Cloudy' | 'Rain' | 'Thunder' {
  if (code == null || !Number.isFinite(code)) return 'Cloudy'
  if (code === 95 || code === 96 || code === 99) return 'Thunder'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain'
  if (code === 0 || code === 1) return 'Sunny'
  if (code === 2 || code === 3 || code === 45 || code === 48) return 'Cloudy'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Cloudy'
  return 'Cloudy'
}

async function fetchDailyExtras(lat: number, lon: number): Promise<DailyExtras> {
  const key = wxCacheKey(lat, lon)
  const now = Date.now()
  const cached = __wxCache.get(key)
  if (cached && cached.exp > now) return cached.v

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}` +
    `&longitude=${lon}` +
    `&daily=temperature_2m_min,temperature_2m_max,sunrise,sunset,weather_code` +
    `&forecast_days=1` +
    `&timezone=${encodeURIComponent('Europe/Oslo')}`

  const resp = await fetchWithTimeout(url, {}, 12000)
  if (!resp.ok) throw new Error('Daily extras fetch failed')

  const j: any = await resp.json()

  const tmin = j?.daily?.temperature_2m_min?.[0]
  const tmax = j?.daily?.temperature_2m_max?.[0]
  const sunriseIso = j?.daily?.sunrise?.[0]
  const sunsetIso = j?.daily?.sunset?.[0]
  const codeRaw = j?.daily?.weather_code?.[0]

  const tminN = Number.isFinite(Number(tmin)) ? Number(tmin) : null
  const tmaxN = Number.isFinite(Number(tmax)) ? Number(tmax) : null
  const codeN = Number.isFinite(Number(codeRaw)) ? Number(codeRaw) : null

  const main = weatherMainFromCode(codeN)

  const temp_c =
    tminN != null && tmaxN != null ? (tminN + tmaxN) / 2 : (tmaxN ?? tminN ?? null)

  const v: DailyExtras = {
    sun: { sunrise: hhmmFromIsoLocal(sunriseIso), sunset: hhmmFromIsoLocal(sunsetIso) },
    air: { temp_min_c: tminN, temp_max_c: tmaxN },
    weather: { code: codeN, main },
    temp_c,
    weather_label: main,
  }

  __wxCache.set(key, { exp: now + WX_CACHE_TTL_MS, v })
  return v
}

// ------------------------------
// Water temp min/max (Open-Meteo Marine SST) — cached
// ------------------------------
type WaterMinMax = { temp_min_c: number | null; temp_max_c: number | null }

const SST_CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours
const __sstCache =
  (globalThis as any).__surfSstCache || new Map<string, { exp: number; v: WaterMinMax }>()
;(globalThis as any).__surfSstCache = __sstCache

function sstCacheKey(lat: number, lon: number) {
  const r = (n: number) => Math.round(n * 1e4) / 1e4
  const day = new Date().toISOString().slice(0, 10)
  return `sst|${r(lat)},${r(lon)}|${day}`
}

function localYmdInTz(timeZone: string, d: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(d)
}

async function fetchWaterTempMinMaxToday(lat: number, lon: number): Promise<WaterMinMax> {
  const key = sstCacheKey(lat, lon)
  const now = Date.now()
  const cached = __sstCache.get(key)
  if (cached && cached.exp > now) return cached.v

  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}` +
    `&longitude=${lon}` +
    `&hourly=sea_surface_temperature` +
    `&timezone=${encodeURIComponent('Europe/Oslo')}` +
    `&cell_selection=sea` +
    `&forecast_days=1`

  const resp = await fetchWithTimeout(url, {}, 12000)
  if (!resp.ok) throw new Error('SST fetch failed')

  const j: any = await resp.json()
  const times: any[] = Array.isArray(j?.hourly?.time) ? j.hourly.time : []
  const temps: any[] = Array.isArray(j?.hourly?.sea_surface_temperature) ? j.hourly.sea_surface_temperature : []

  const wantDay = localYmdInTz('Europe/Oslo', new Date())

  let tmin: number | null = null
  let tmax: number | null = null

  for (let i = 0; i < Math.min(times.length, temps.length); i++) {
    const ti = String(times[i] ?? '')
    const day = ti.slice(0, 10)
    if (day !== wantDay) continue
    const v = Number(temps[i])
    if (!Number.isFinite(v)) continue
    if (tmin == null || v < tmin) tmin = v
    if (tmax == null || v > tmax) tmax = v
  }

  const v: WaterMinMax = { temp_min_c: tmin, temp_max_c: tmax }
  __sstCache.set(key, { exp: now + SST_CACHE_TTL_MS, v })
  return v
}

// ------------------------------
// Fuel penalty (driving time)
// ------------------------------
const FUEL_POINTS_PER_MIN = 35 / 60
const FUEL_MAX_PENALTY_POINTS = 35

type LatLon = { lat: number; lon: number }

function asNum(v: string | null) {
  if (v == null) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

function asInt(v: string | null) {
  if (v == null) return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

function isoHourUTC(d = new Date()) {
  const x = new Date(d)
  x.setUTCMinutes(0, 0, 0)
  return x.toISOString().slice(0, 13) + ':00'
}

function nearestHourIndex(times: string[], targetIsoHour: string) {
  const idx = times.indexOf(targetIsoHour)
  if (idx >= 0) return idx

  const t = Date.parse(targetIsoHour + ':00Z')
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < times.length; i++) {
    const ti = Date.parse(times[i] + ':00Z')
    const dist = Math.abs(ti - t)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

type Sideswell = {
  present: boolean
  height_m: number
  direction_deg_from: number
  period_s: number
}

type MarineBundle = {
  time_utc: string
  primary: Sideswell
  secondary: Sideswell
  wind_speed_ms: number
  wind_direction_deg_from: number
}

type MarineSeries = {
  mt: string[]
  wt: string[]
  mi: number
  wi: number
  pH: number[]
  pD: number[]
  pP: number[]
  sH: number[]
  sD: number[]
  sP: number[]
  windS: number[]
  windD: number[]
}

const SECONDARY_MIN_M = 0.05

function toNum(x: any) {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

function correctedHeightForPick(h: number, p: number) {
  if (!(h > 0) || !(p > 0)) return h
  return h * (p / 10)
}

function makeBundleAt(series: MarineSeries, hourOffset: number): MarineBundle {
  const mi = clampInt(series.mi + hourOffset, 0, series.mt.length - 1)
  const wi = clampInt(series.wi + hourOffset, 0, series.wt.length - 1)

  const pH = toNum(series.pH[mi])
  const pD = toNum(series.pD[mi])
  const pP = toNum(series.pP[mi])

  const sH = toNum(series.sH[mi])
  const sD = toNum(series.sD[mi])
  const sP = toNum(series.sP[mi])

  const wind_speed = toNum(series.windS[wi])
  const wind_dir = toNum(series.windD[wi])

  const secondaryPresent = sH >= SECONDARY_MIN_M

  return {
    time_utc: series.mt[mi],
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
    wind_speed_ms: wind_speed,
    wind_direction_deg_from: wind_dir,
  }
}

async function fetchMarineSeries(lat: number, lon: number): Promise<MarineSeries> {
  const timeHour = isoHourUTC()

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}` +
    `&longitude=${lon}` +
    `&hourly=` +
    `wave_height,wave_direction,wave_period,` +
    `secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period` +
    `&timezone=UTC`

  const windUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}` +
    `&longitude=${lon}` +
    `&hourly=wind_speed_10m,wind_direction_10m` +
    `&timezone=UTC&wind_speed_unit=ms`

  const [marineResp, windResp] = await Promise.all([
    fetchWithTimeout(marineUrl, {}, 12000),
    fetchWithTimeout(windUrl, {}, 12000),
  ])
  if (!marineResp.ok) throw new Error('Marine fetch failed')
  if (!windResp.ok) throw new Error('Wind fetch failed')

  const marine = await marineResp.json()
  const wind = await windResp.json()

  const mt: string[] = marine?.hourly?.time ?? []
  const wt: string[] = wind?.hourly?.time ?? []
  if (!Array.isArray(mt) || !mt.length) throw new Error('Marine data missing time')
  if (!Array.isArray(wt) || !wt.length) throw new Error('Wind data missing time')

  const mi = nearestHourIndex(mt, timeHour)
  const wi = nearestHourIndex(wt, timeHour)

  const pH: number[] = Array.isArray(marine?.hourly?.wave_height) ? marine.hourly.wave_height.map(toNum) : []
  const pD: number[] = Array.isArray(marine?.hourly?.wave_direction) ? marine.hourly.wave_direction.map(toNum) : []
  const pP: number[] = Array.isArray(marine?.hourly?.wave_period) ? marine.hourly.wave_period.map(toNum) : []

  const sH: number[] = Array.isArray(marine?.hourly?.secondary_swell_wave_height)
    ? marine.hourly.secondary_swell_wave_height.map(toNum)
    : []
  const sD: number[] = Array.isArray(marine?.hourly?.secondary_swell_wave_direction)
    ? marine.hourly.secondary_swell_wave_direction.map(toNum)
    : []
  const sP: number[] = Array.isArray(marine?.hourly?.secondary_swell_wave_period)
    ? marine.hourly.secondary_swell_wave_period.map(toNum)
    : []

  const windS: number[] = Array.isArray(wind?.hourly?.wind_speed_10m) ? wind.hourly.wind_speed_10m.map(toNum) : []
  const windD: number[] = Array.isArray(wind?.hourly?.wind_direction_10m) ? wind.hourly.wind_direction_10m.map(toNum) : []

  return { mt, wt, mi, wi, pH, pD, pP, sH, sD, sP, windS, windD }
}

/** ---------- User experience fetch ---------- **/

type UserExpMap = Record<string, UserSurfExperienceRecord[]>

function authBearerFromReq(req: Request) {
  const raw = req.headers.get('authorization') || ''
  console.log('RAW AUTH HEADER VALUE:', raw)
  console.log('ALL HEADERS AUTH:', req.headers.get('authorization'))
  return raw.startsWith('Bearer ') ? raw : ''
}

async function fetchUserExperiencesBySpotIds(req: Request, spotIds: string[]): Promise<UserExpMap> {
  const out: UserExpMap = {}
  for (const id of spotIds) out[id] = []

  const bearer = authBearerFromReq(req)
  console.log('SURF AUTH has bearer:', !!bearer)
  console.log('SURF AUTH bearer preview:', bearer ? bearer.slice(0, 25) : null)

  if (!bearer) return out

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return out

  const ids = Array.from(new Set(spotIds.map((s) => String(s || '').trim()).filter(Boolean)))
  if (!ids.length) return out

  const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: bearer,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const {
    data: { user },
    error: userErr,
  } = await userSupabase.auth.getUser()

  console.log('SURF AUTH userErr:', userErr?.message ?? null)
  console.log('SURF AUTH user id:', user?.id ?? null)

  let ownerUserId: string | null = user?.id ?? null

  if (!ownerUserId) {
    const rawToken = bearer.replace(/^Bearer\s+/i, '').trim()
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const { data: deviceRow, error: deviceErr } = await adminSupabase
      .from('devices')
      .select('device_id')
      .eq('device_token_hash', tokenHash)
      .maybeSingle()

    console.log('SURF AUTH device lookup error:', deviceErr?.message ?? null)
    console.log('SURF AUTH device id:', deviceRow?.device_id ?? null)

    if (!deviceRow?.device_id) return out

    const { data: memberRow, error: memberErr } = await adminSupabase
      .from('device_members')
      .select('user_id, role')
      .eq('device_id', deviceRow.device_id)
      .eq('role', 'owner')
      .maybeSingle()

    console.log('SURF AUTH member lookup error:', memberErr?.message ?? null)
    console.log('SURF AUTH member user id:', memberRow?.user_id ?? null)
    console.log('SURF AUTH member role:', memberRow?.role ?? null)

    ownerUserId = memberRow?.user_id ?? null

    if (!ownerUserId) return out

    const { data, error } = await adminSupabase
      .from('user_surf_experiences')
      .select(`
        id,
        user_id,
        spot_id,
        spot,
        logged_at,
        wave_dir_from_deg,
        wave_height_m,
        wave_period_s,
        wind_dir_from_deg,
        wind_speed_ms,
        rating_1_6,
        created_at,
        updated_at
      `)
      .eq('user_id', ownerUserId)
      .or(`spot_id.in.(${ids.join(',')}),spot.in.(${ids.join(',')})`)
      .order('logged_at', { ascending: false })

    console.log('SURF AUTH device-path experience error:', error?.message ?? null)
    console.log('SURF AUTH device-path experience count:', Array.isArray(data) ? data.length : null)

    if (error || !Array.isArray(data)) return out

    for (const row of data) {
      const sid = String(row?.spot_id ?? '').trim()
      if (!sid) continue
      if (!out[sid]) out[sid] = []
      out[sid].push(row as UserSurfExperienceRecord)
    }

    return out
  }

  const { data, error } = await userSupabase
    .from('user_surf_experiences')
    .select(`
      id,
      user_id,
      spot_id,
      spot,
      logged_at,
      wave_dir_from_deg,
      wave_height_m,
      wave_period_s,
      wind_dir_from_deg,
      wind_speed_ms,
      rating_1_6,
      created_at,
      updated_at
    `)
    .eq('user_id', ownerUserId)
    .or(`spot_id.in.(${ids.join(',')}),spot.in.(${ids.join(',')})`)
    .order('logged_at', { ascending: false })

  console.log('SURF AUTH user-path experience error:', error?.message ?? null)
  console.log('SURF AUTH user-path experience count:', Array.isArray(data) ? data.length : null)

  if (error || !Array.isArray(data)) return out

  for (const row of data) {
    const sid = String(row?.spot_id ?? '').trim()
    if (!sid) continue
    if (!out[sid]) out[sid] = []
    out[sid].push(row as UserSurfExperienceRecord)
  }

  return out
}

function userExperiencesForSpot(
  userExpBySpotId: UserExpMap,
  spotId: string | null | undefined
): UserSurfExperienceRecord[] {
  const sid = String(spotId ?? '').trim()
  if (!sid) return []
  return Array.isArray(userExpBySpotId[sid]) ? userExpBySpotId[sid] : []
}

/** ---------- Scored comparisons ---------- **/

function scoredBlendFloat(scored: any) {
  const x = Number(scored?.breakdown?.experience?.blended_rating_float)
  const r = Number(scored?.rating)
  if (Number.isFinite(x)) return x
  if (Number.isFinite(r)) return r
  return -Infinity
}

function scoredRating(scored: any) {
  const r = Number(scored?.rating)
  return Number.isFinite(r) ? r : -Infinity
}

function scoredConfidence(scored: any) {
  const c = Number(scored?.breakdown?.experience?.confidence)
  return Number.isFinite(c) ? c : 0
}

function scoredTablesTotal(scored: any) {
  const t = Number(scored?.breakdown?.tables?.total)
  return Number.isFinite(t) ? t : -Infinity
}

function scoredExperienceMatched(scored: any) {
  return !!scored?.breakdown?.experience?.matched
}

function compareScored(scoredA: any, scoredB: any) {
  const aBlend = scoredBlendFloat(scoredA)
  const bBlend = scoredBlendFloat(scoredB)
  if (bBlend > aBlend) return 1
  if (aBlend > bBlend) return -1

  const aRating = scoredRating(scoredA)
  const bRating = scoredRating(scoredB)
  if (bRating > aRating) return 1
  if (aRating > bRating) return -1

  const aMatched = scoredExperienceMatched(scoredA)
  const bMatched = scoredExperienceMatched(scoredB)
  if (aMatched && !bMatched) return -1
  if (bMatched && !aMatched) return 1

  const aConf = scoredConfidence(scoredA)
  const bConf = scoredConfidence(scoredB)
  if (bConf > aConf) return 1
  if (aConf > bConf) return -1

  const aTot = scoredTablesTotal(scoredA)
  const bTot = scoredTablesTotal(scoredB)
  if (bTot > aTot) return 1
  if (aTot > bTot) return -1

  return 0
}

function betterByScoredThenHeight(args: {
  scoredA: any
  scoredB: any
  correctedHeightA: number
  correctedHeightB: number
}) {
  const cmp = compareScored(args.scoredA, args.scoredB)
  if (cmp !== 0) return cmp
  if (args.correctedHeightB > args.correctedHeightA) return 1
  if (args.correctedHeightA > args.correctedHeightB) return -1
  return 0
}

function pickBestSwell(args: {
  spotKey: string
  marine: MarineBundle
  userExperiences?: UserSurfExperienceRecord[]
}) {
  const { spotKey, marine, userExperiences } = args

  const windSpeedMs = marine.wind_speed_ms
  const windDirDeg = marine.wind_direction_deg_from

  const primaryScore = scoreSurf({
    spotKey,
    swellHeightM: marine.primary.height_m,
    swellPeriodS: marine.primary.period_s,
    swellDirDeg: marine.primary.direction_deg_from,
    windSpeedMs,
    windDirDeg,
    userExperiences,
  })

  if (!marine.secondary.present) {
    return {
      chosen: 'primary' as const,
      chosenScore: primaryScore,
      secondaryScore: null as any,
      primaryScore,
    }
  }

  const secondaryScore = scoreSurf({
    spotKey,
    swellHeightM: marine.secondary.height_m,
    swellPeriodS: marine.secondary.period_s,
    swellDirDeg: marine.secondary.direction_deg_from,
    windSpeedMs,
    windDirDeg,
    userExperiences,
  })

  const primAdj = correctedHeightForPick(marine.primary.height_m, marine.primary.period_s)
  const secAdj = correctedHeightForPick(marine.secondary.height_m, marine.secondary.period_s)

  const cmp = betterByScoredThenHeight({
    scoredA: primaryScore,
    scoredB: secondaryScore,
    correctedHeightA: primAdj,
    correctedHeightB: secAdj,
  })

  if (cmp > 0) {
    return {
      chosen: 'secondary' as const,
      chosenScore: secondaryScore,
      secondaryScore,
      primaryScore,
    }
  }

  return {
    chosen: 'primary' as const,
    chosenScore: primaryScore,
    secondaryScore,
    primaryScore,
  }
}

/** ---------- Bucket lookup (independent of experience) ---------- **/

function fixMojibake(s: string) {
  const str = String(s ?? '')
  if (/[ÃÂ]/.test(str)) {
    try {
      return Buffer.from(str, 'latin1').toString('utf8')
    } catch {
      return str
    }
  }
  return str
}

function normalizeSpotKey(s: string) {
  return fixMojibake(String(s ?? '')).trim()
}

function findKeyByNormalized(map: Record<string, any> | null | undefined, want: string): string | null {
  if (!map || typeof map !== 'object') return null
  const wantN = normalizeSpotKey(want)
  if (Object.prototype.hasOwnProperty.call(map, want)) return want
  for (const k of Object.keys(map)) {
    if (normalizeSpotKey(k) === wantN) return k
  }
  return null
}

function getSpotTables(spotKey: string): any | null {
  const want = normalizeSpotKey(spotKey)
  const T: any = TABLES as any

  if (T && typeof T === 'object' && !Array.isArray(T)) {
    const rootKey = findKeyByNormalized(T as any, want)
    if (rootKey) {
      const v = (T as any)[rootKey]
      if (v && typeof v === 'object' && (v.wave_dir || v.wind_dir || v.wave_height)) return v
    }
  }

  const spotsMap: any = (T as any)?.spots
  const spotKeyInMap = findKeyByNormalized(spotsMap, want)
  if (spotKeyInMap) return spotsMap[spotKeyInMap]

  return null
}

function bucketLabelFromRangeTable(arrRaw: any[], value: number): string | null {
  if (!Array.isArray(arrRaw) || !arrRaw.length) return null
  const v = Number.isFinite(value) ? value : 0

  const arr = [...arrRaw].sort((a, b) => Number(a?.min ?? 0) - Number(b?.min ?? 0))

  for (const b of arr) {
    const mn = Number(b?.min ?? Number.NEGATIVE_INFINITY)
    const mxRaw = b?.max
    const mx = mxRaw === null || mxRaw === undefined ? Number.POSITIVE_INFINITY : Number(mxRaw)
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) continue
    if (v >= mn && v <= mx) {
      const lbl = String(b?.label ?? '').trim()
      if (lbl) return lbl
      if (Number.isFinite(mn) && Number.isFinite(mx)) return `${mn}-${mx}`
      return null
    }
  }

  for (const b of arr) {
    const mn = Number(b?.min)
    if (!Number.isFinite(mn)) continue
    if (v <= mn) {
      const lbl = String(b?.label ?? '').trim()
      if (lbl) return lbl
      const mxRaw = b?.max
      const mx = mxRaw === null || mxRaw === undefined ? null : mxRaw
      if (Number.isFinite(Number(mn)) && (mx === null || Number.isFinite(Number(mx)))) {
        return mx === null ? `${mn}+` : `${mn}-${mx}`
      }
      return null
    }
  }

  const last = arr[arr.length - 1]
  {
    const lbl = String(last?.label ?? '').trim()
    if (lbl) return lbl
    const mn = last?.min
    const mxRaw = last?.max
    const mx = mxRaw === null || mxRaw === undefined ? null : mxRaw
    if (Number.isFinite(Number(mn)) && (mx === null || Number.isFinite(Number(mx)))) {
      return mx === null ? `${mn}+` : `${mn}-${mx}`
    }
  }

  return null
}

function formatBucketLabelForUi(label: string | null | undefined): string | null {
  const s = String(label ?? '').trim()
  if (!s) return null

  if (/[mM]\s*$/.test(s)) return s

  const mPlus = s.match(/^(\d+(?:\.\d+)?)\+$/)
  if (mPlus) return `${mPlus[1]}+m`

  const mRange = s.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/)
  if (mRange) {
    const a = Number(mRange[1])
    const b = Number(mRange[2])
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return `${a.toFixed(1)} - ${b.toFixed(1)}m`
    }
  }

  const mRange2 = s.match(/^(\d+)\s*-\s*(\d+(?:\.\d+)?)$/)
  if (mRange2) {
    const a = Number(mRange2[1])
    const b = Number(mRange2[2])
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return `${a.toFixed(1)} - ${b.toFixed(1)}m`
    }
  }

  if (/^\d/.test(s)) return `${s}m`
  return s
}

function fmtRange(min: number, max: number) {
  const a = Number.isFinite(min) ? min : 0
  const b = Number.isFinite(max) ? max : 0
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)

  const loS = lo.toFixed(1)
  const hiS = hi.toFixed(1)

  if (loS === hiS) return `${loS}m`
  return `${loS} - ${hiS}m`
}

/** ---------- Today's Best ---------- **/

function isTodaysBest(spotIdQ: string, spotQ: string) {
  const sId = String(spotIdQ || '').trim()
  const s = String(spotQ || '').trim()
  return sId === TODAYS_BEST_ID || s.toLowerCase() === TODAYS_BEST_LABEL.toLowerCase()
}

type BestPick = {
  hourOffset: number
  marine: MarineBundle
  picked: ReturnType<typeof pickBestSwell>
  scored: any
  tablesTotal: number
  correctedHeight: number
  blendedFloat: number
  confidence: number
}

function bestWithinWindow(
  series: MarineSeries,
  spotKeyForTables: string,
  hours: number,
  userExperiences: UserSurfExperienceRecord[]
): BestPick {
  let best: BestPick | null = null

  for (let off = 0; off < hours; off++) {
    const marine = makeBundleAt(series, off)
    const picked = pickBestSwell({ spotKey: spotKeyForTables, marine, userExperiences })
    const scored = picked.chosenScore

    const tablesTotal = scoredTablesTotal(scored)
    const chosenH = picked.chosen === 'secondary' ? marine.secondary.height_m : marine.primary.height_m
    const chosenP = picked.chosen === 'secondary' ? marine.secondary.period_s : marine.primary.period_s
    const corr = correctedHeightForPick(chosenH, chosenP)

    const cand: BestPick = {
      hourOffset: off,
      marine,
      picked,
      scored,
      tablesTotal,
      correctedHeight: corr,
      blendedFloat: scoredBlendFloat(scored),
      confidence: scoredConfidence(scored),
    }

    if (!best) {
      best = cand
      continue
    }

    const cmp = betterByScoredThenHeight({
      scoredA: best.scored,
      scoredB: cand.scored,
      correctedHeightA: best.correctedHeight,
      correctedHeightB: cand.correctedHeight,
    })

    if (cmp > 0) best = cand
  }

  return best!
}

// ------------------------------
// Geoapify driving time matrix + TTL cache
// ------------------------------
type DriveMap = Record<string, number>

const DRIVE_CACHE_TTL_MS = 20 * 60 * 1000 // 20 minutes

const __driveCache =
  (globalThis as any).__surfDriveCache || new Map<string, { exp: number; v: DriveMap }>()
;(globalThis as any).__surfDriveCache = __driveCache

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6
}

function driveCacheKey(home: LatLon, targets: Array<{ spotId: string; lat: number; lon: number }>) {
  const h = `${round6(home.lat)},${round6(home.lon)}`
  const t = targets
    .map((x) => `${x.spotId}:${round6(x.lat)},${round6(x.lon)}`)
    .sort()
    .join('|')
  return `geoapify|${h}|${t}`
}

async function fetchDriveMinutesGeoapify(home: LatLon, targets: Array<{ spotId: string; lat: number; lon: number }>) {
  const apiKey = process.env.GEOAPIFY_API_KEY
  if (!apiKey) throw new Error('Missing GEOAPIFY_API_KEY')

  const key = driveCacheKey(home, targets)
  const now = Date.now()
  const cached = __driveCache.get(key)
  if (cached && cached.exp > now) return cached.v

  const body = {
    mode: 'drive',
    sources: [{ location: [home.lon, home.lat] }],
    targets: targets.map((t) => ({ location: [t.lon, t.lat] })),
  }

  const resp = await fetchWithTimeout(
    `https://api.geoapify.com/v1/routematrix?apiKey=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    12000
  )

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(`Geoapify routematrix failed: ${resp.status} ${txt}`.trim())
  }

  const j: any = await resp.json()

  const mat: any[][] = Array.isArray(j?.sources_to_targets) ? j.sources_to_targets : []
  const row0: any[] = Array.isArray(mat?.[0]) ? mat[0] : []

  const out: Record<string, number> = {}

  for (let i = 0; i < targets.length; i++) {
    const cell = row0[i]
    if (!cell || typeof cell !== 'object') continue

    const sec = Number(cell.time)
    if (Number.isFinite(sec) && sec >= 0) {
      out[targets[i].spotId] = sec / 60
    }
  }

  __driveCache.set(key, { exp: now + DRIVE_CACHE_TTL_MS, v: out })
  return out
}

function fuelPenaltyPointsFromMinutes(extraMin: number) {
  const raw = extraMin * FUEL_POINTS_PER_MIN
  const pts = Math.round(raw)
  return Math.max(0, Math.min(FUEL_MAX_PENALTY_POINTS, pts))
}

// ------------------------------
// Concurrency helper
// ------------------------------
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T, idx: number) => Promise<R>) {
  const out: R[] = new Array(items.length)
  let next = 0

  const workers = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  })

  await Promise.all(workers)
  return out
}

/** ---------- Dayparts helpers ---------- **/

function truthy1(v: string | null) {
  const s = String(v ?? '').trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

function tzPartsYMDH(timeZone: string, d: Date) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  })
  const parts = fmt.formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value
  const y = Number(get('year'))
  const m = Number(get('month'))
  const day = Number(get('day'))
  const h = Number(get('hour'))
  return { y, m, day, h }
}

function tzOffsetMinutes(timeZone: string, d: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = fmt.formatToParts(d)
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  const m = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!m) return 0
  const sign = m[1] === '-' ? -1 : 1
  const hh = Number(m[2] ?? 0)
  const mm = Number(m[3] ?? 0)
  return sign * (hh * 60 + mm)
}

function addDaysYMD(y: number, m: number, d: number, add: number) {
  const base = new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
  const next = new Date(base.getTime() + add * 24 * 60 * 60 * 1000)
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() }
}

function isoHourUTCFromLocalYMDH(timeZone: string, y: number, m: number, d: number, hourLocal: number) {
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hourLocal, 0, 0))
  const offMin = tzOffsetMinutes(timeZone, utcGuess)
  const actualUtc = new Date(utcGuess.getTime() - offMin * 60 * 1000)
  actualUtc.setUTCMinutes(0, 0, 0)
  return actualUtc.toISOString().slice(0, 13) + ':00'
}

function bundleAtIsoHour(series: MarineSeries, targetIsoHourUtc: string) {
  const targetMi = nearestHourIndex(series.mt, targetIsoHourUtc)
  const hourOffset = targetMi - series.mi
  return makeBundleAt(series, hourOffset)
}

function waveHeightLabelForValue(spotKeyForTables: string, waveHeight: number) {
  const st = getSpotTables(spotKeyForTables)
  const raw = bucketLabelFromRangeTable(st?.wave_height ?? [], waveHeight)
  return formatBucketLabelForUi(raw) ?? fmtRange(waveHeight, waveHeight)
}

function buildDayparts(
  series: MarineSeries,
  spotKeyForTables: string,
  userExperiences: UserSurfExperienceRecord[]
) {
  const now = new Date()
  const nowLocal = tzPartsYMDH(DAYPARTS_TZ, now)

  const dayOffset = Number.isFinite(nowLocal.h) && nowLocal.h >= 21 ? 1 : 0

  const ymdBase = dayOffset
    ? addDaysYMD(nowLocal.y, nowLocal.m, nowLocal.day, dayOffset)
    : { y: nowLocal.y, m: nowLocal.m, d: nowLocal.day }

  function bestAroundTargetIso(isoTargetHour: string) {
    const targetIdx = nearestHourIndex(series.mt, isoTargetHour)

    const candidates = [targetIdx - 2, targetIdx - 1, targetIdx, targetIdx + 1].map((i) =>
      clampInt(i, 0, series.mt.length - 1)
    )

    let best: {
      idx: number
      marine: MarineBundle
      picked: ReturnType<typeof pickBestSwell>
      scored: any
      tablesTotal: number
      correctedHeight: number
    } | null = null

    for (const idx of candidates) {
      const iso = series.mt[idx]
      const marine = bundleAtIsoHour(series, iso)

      const picked = pickBestSwell({ spotKey: spotKeyForTables, marine, userExperiences })
      const scored = picked.chosenScore

      const tablesTotal = scoredTablesTotal(scored)

      const chosenH = picked.chosen === 'secondary' ? marine.secondary.height_m : marine.primary.height_m
      const chosenP = picked.chosen === 'secondary' ? marine.secondary.period_s : marine.primary.period_s
      const corr = correctedHeightForPick(chosenH, chosenP)

      const cand = { idx, marine, picked, scored, tablesTotal, correctedHeight: corr }

      if (!best) {
        best = cand
        continue
      }

      const cmp = betterByScoredThenHeight({
        scoredA: best.scored,
        scoredB: cand.scored,
        correctedHeightA: best.correctedHeight,
        correctedHeightB: cand.correctedHeight,
      })

      if (cmp > 0) best = cand
    }

    return best!
  }

  return DAYPART_TARGETS.map((dp) => {
    const isoTarget = isoHourUTCFromLocalYMDH(DAYPARTS_TZ, ymdBase.y, ymdBase.m, ymdBase.d, dp.hourLocal)
    const best = bestAroundTargetIso(isoTarget)

    const marine = best.marine
    const picked = best.picked
    const scored = best.scored

    const waveHeight = picked.chosen === 'secondary' ? marine.secondary.height_m : marine.primary.height_m
    const waveLabel = waveHeightLabelForValue(spotKeyForTables, waveHeight)
    const swellPeriod = picked.chosen === 'secondary' ? marine.secondary.period_s : marine.primary.period_s

    return {
      label: dp.label,
      time_utc: marine.time_utc,
      rating: scored?.rating ?? null,
      wave_height_range_label: waveLabel,
      swell_period_s: Number.isFinite(swellPeriod) ? Math.round(swellPeriod) : null,
      wind_speed_ms: Number.isFinite(marine.wind_speed_ms) ? Math.round(marine.wind_speed_ms) : null,
    }
  })
}

// ------------------------------
// best within window toggle
// ------------------------------
function bestModeEnabled(url: URL, hours: number) {
  const raw = (url.searchParams.get('best') ?? '').trim().toLowerCase()
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false
  return (hours ?? 0) >= 2
}

/** ---------- XL daily (tomorrow +3) using 4h-average windows ---------- **/

function tzPartsYMD(timeZone: string, d: Date) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value
  const y = Number(get('year'))
  const m = Number(get('month'))
  const day = Number(get('day'))
  return { y, m, day }
}

function ymdKey(y: number, m: number, d: number) {
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

function weekdayLabelForYMD(timeZone: string, y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long' })
  return fmt.format(dt)
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180
}
function radToDeg(rad: number) {
  return (rad * 180) / Math.PI
}
function normDeg360(d: number) {
  let x = d
  while (x < 0) x += 360
  while (x >= 360) x -= 360
  return x
}
function circularMeanDeg(values: number[]) {
  const vals = values.filter((v) => Number.isFinite(v))
  if (!vals.length) return 0
  let sx = 0
  let sy = 0
  for (const deg of vals) {
    const a = degToRad(deg)
    sx += Math.cos(a)
    sy += Math.sin(a)
  }
  const ang = Math.atan2(sy, sx)
  return normDeg360(radToDeg(ang))
}

function avg(values: number[]) {
  const vals = values.filter((v) => Number.isFinite(v))
  if (!vals.length) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

type HourEval = {
  idx: number
  marine: MarineBundle
  picked: ReturnType<typeof pickBestSwell>
  scored: any
  rating: number
  tablesTotal: number
  correctedHeight: number
  chosenH: number
  chosenP: number
  chosenDir: number
  windS: number
  windDir: number
}

function evalHourAtIdx(
  series: MarineSeries,
  spotKey: string,
  idx: number,
  userExperiences: UserSurfExperienceRecord[]
): HourEval {
  const iso = series.mt[clampInt(idx, 0, series.mt.length - 1)]
  const marine = bundleAtIsoHour(series, iso)
  const picked = pickBestSwell({ spotKey, marine, userExperiences })
  const scored = picked.chosenScore

  const tablesTotal = scoredTablesTotal(scored)

  const chosenH = picked.chosen === 'secondary' ? marine.secondary.height_m : marine.primary.height_m
  const chosenP = picked.chosen === 'secondary' ? marine.secondary.period_s : marine.primary.period_s
  const chosenDir = picked.chosen === 'secondary' ? marine.secondary.direction_deg_from : marine.primary.direction_deg_from

  const corr = correctedHeightForPick(chosenH, chosenP)

  return {
    idx,
    marine,
    picked,
    scored,
    rating: Number(scored?.rating ?? 0) || 0,
    tablesTotal,
    correctedHeight: corr,
    chosenH,
    chosenP,
    chosenDir,
    windS: marine.wind_speed_ms,
    windDir: marine.wind_direction_deg_from,
  }
}

function best4hWindowForLocalDay(
  series: MarineSeries,
  spotKey: string,
  y: number,
  m: number,
  d: number,
  userExperiences: UserSurfExperienceRecord[]
) {
  const indices: number[] = []
  for (let i = 0; i < series.mt.length; i++) {
    const tIso = series.mt[i]
    const dt = new Date(tIso + ':00Z')
    const p = tzPartsYMD(DAILY_TZ, dt)
    if (p.y === y && p.m === m && p.day === d) indices.push(i)
  }
  if (indices.length < 4) return null

  let best: {
    startIdx: number
    hours: HourEval[]
    avgBlend: number
    avgRating: number
    avgConfidence: number
    avgTables: number
    avgCorr: number
  } | null = null

  const isSameLocalDay = (idx: number) => {
    const dt = new Date(series.mt[idx] + ':00Z')
    const p = tzPartsYMD(DAILY_TZ, dt)
    return p.y === y && p.m === m && p.day === d
  }

  const minIdx = Math.min(...indices)
  const maxIdx = Math.max(...indices)

  for (let start = minIdx; start <= maxIdx - 3; start++) {
    if (!isSameLocalDay(start) || !isSameLocalDay(start + 1) || !isSameLocalDay(start + 2) || !isSameLocalDay(start + 3))
      continue

    const hrs = [start, start + 1, start + 2, start + 3].map((i) =>
      evalHourAtIdx(series, spotKey, i, userExperiences)
    )

    const avgBlend = avg(hrs.map((h) => scoredBlendFloat(h.scored)))
    const avgRating = avg(hrs.map((h) => h.rating))
    const avgConfidence = avg(hrs.map((h) => scoredConfidence(h.scored)))
    const avgTables = avg(hrs.map((h) => h.tablesTotal))
    const avgCorr = avg(hrs.map((h) => h.correctedHeight))

    const cand = { startIdx: start, hours: hrs, avgBlend, avgRating, avgConfidence, avgTables, avgCorr }

    if (!best) {
      best = cand
      continue
    }

    if (cand.avgBlend > best.avgBlend) best = cand
    else if (cand.avgBlend < best.avgBlend) {
      /* keep */
    } else if (cand.avgRating > best.avgRating) best = cand
    else if (cand.avgRating < best.avgRating) {
      /* keep */
    } else if (cand.avgConfidence > best.avgConfidence) best = cand
    else if (cand.avgConfidence < best.avgConfidence) {
      /* keep */
    } else if (cand.avgTables > best.avgTables) best = cand
    else if (cand.avgTables < best.avgTables) {
      /* keep */
    } else if (cand.avgCorr > best.avgCorr) best = cand
  }

  return best
}

function buildDailyFrom4hWindows(
  series: MarineSeries,
  spotKey: string,
  days: number,
  userExperiences: UserSurfExperienceRecord[]
) {
  const nowLocal = tzPartsYMD(DAILY_TZ, new Date())
  const out: any[] = []

  const n = clampInt(days, 1, 5)

  for (let di = 0; di < n; di++) {
    const ymd = addDaysYMD(nowLocal.y, nowLocal.m, nowLocal.day, di)
    const wd = weekdayLabelForYMD(DAILY_TZ, ymd.y, ymd.m, ymd.d)

    const best = best4hWindowForLocalDay(series, spotKey, ymd.y, ymd.m, ymd.d, userExperiences)

    if (!best) {
      out.push({
        label: wd,
        date_local: ymdKey(ymd.y, ymd.m, ymd.d),
        rating: null,
        wave_height_range_label: '--',
        swell_period_s: null,
        wind_speed_ms: null,
      })
      continue
    }

    const hours = best.hours

    const waveH = avg(hours.map((h) => h.chosenH))
    const periodS = avg(hours.map((h) => h.chosenP))
    const swellDirFrom = circularMeanDeg(hours.map((h) => h.chosenDir))
    const windS = avg(hours.map((h) => h.windS))
    const windDirFrom = circularMeanDeg(hours.map((h) => h.windDir))

    const scored = scoreSurf({
      spotKey,
      swellHeightM: waveH,
      swellPeriodS: periodS,
      swellDirDeg: swellDirFrom,
      windSpeedMs: windS,
      windDirDeg: windDirFrom,
      userExperiences,
    })

    const waveLabel = waveHeightLabelForValue(spotKey, waveH)

    out.push({
      label: wd,
      date_local: ymdKey(ymd.y, ymd.m, ymd.d),
      rating: scored?.rating ?? null,
      wave_height_range_label: waveLabel,
      swell_period_s: Number.isFinite(periodS) ? Math.round(periodS) : null,
      wind_speed_ms: Number.isFinite(windS) ? Math.round(windS) : null,
      time_utc: hours[0]?.marine?.time_utc ?? null,
    })
  }

  return out
}

export async function GET(req: Request) {
  try {
    
    console.log('RAW AUTH HEADER:', req.headers.get('authorization'))
    const url = new URL(req.url)
    console.log('SURF SCORE QUERY:', Object.fromEntries(url.searchParams.entries()))

    const spotIdQ = (url.searchParams.get('spotId') || '').trim()
    const spotQ = (url.searchParams.get('spot') || '').trim()

    const latQ = asNum(url.searchParams.get('lat'))
    const lonQ = asNum(url.searchParams.get('lon'))

    const hoursQ = asInt(url.searchParams.get('hours'))
    const hours = clampInt(hoursQ ?? 4, 1, 12)

    const daypartsOn = truthy1(url.searchParams.get('dayparts'))

    const dailyOn = truthy1(url.searchParams.get('daily'))
    const daysQ = asInt(url.searchParams.get('days'))
    const days = clampInt(daysQ ?? 5, 1, 5)

    const fuelOn =
      (url.searchParams.get('fuelPenalty') || '').trim() === '1' ||
      (url.searchParams.get('fuelPenalty') || '').trim().toLowerCase() === 'true'

    const homeLatQ = asNum(url.searchParams.get('homeLat'))
    const homeLonQ = asNum(url.searchParams.get('homeLon'))
    const home: LatLon | null = fuelOn && homeLatQ != null && homeLonQ != null ? { lat: homeLatQ, lon: homeLonQ } : null

    const bestOn = bestModeEnabled(url, hours)

    const userExpBySpotId = await fetchUserExperiencesBySpotIds(
      req,
      Object.values(SURF_SPOTS)
        .map((s) => String(s?.spotId ?? '').trim())
        .filter(Boolean)
    )

    const hasBearer = !!authBearerFromReq(req)

    // ---------- Today's Best ----------
    if (isTodaysBest(spotIdQ, spotQ)) {
      const EXCLUDE_FROM_TODAYS_BEST = new Set<string>([
        TODAYS_BEST_ID,
        'vigdel',
      ])

      const candidates = Object.values(SURF_SPOTS).filter((s) => {
        if (!s || !s.spotId) return false
        if (EXCLUDE_FROM_TODAYS_BEST.has(s.spotId)) return false
        if (s.label.toLowerCase() === TODAYS_BEST_LABEL.toLowerCase()) return false
        return true
      })

      if (!candidates.length) {
        return jsonNoStore({ error: 'No spots available for Today’s Best' }, { status: 500 })
      }

      const CONCURRENCY = 4

      const settled = await mapWithConcurrency(candidates, CONCURRENCY, async (s) => {
        try {
          const series = await fetchMarineSeries(s.lat, s.lon)
          const userExperiences = userExperiencesForSpot(userExpBySpotId, s.spotId)

          const best = bestWithinWindow(series, s.label, hours, userExperiences)
          const tablesTotal = Number(best?.tablesTotal ?? -Infinity)

          return {
            ok: true as const,
            spotId: s.spotId,
            spotLabel: s.label,
            lat: s.lat,
            lon: s.lon,
            series,
            best,
            drive_minutes: null as number | null,
            fuel_penalty_points: 0,
            effective_tables_total: tablesTotal,
          }
        } catch {
          return { ok: false as const }
        }
      })

      const results = settled.filter((x: any) => x && x.ok) as Array<{
        spotId: string
        spotLabel: string
        lat: number
        lon: number
        series: MarineSeries
        best: BestPick
        drive_minutes: number | null
        fuel_penalty_points: number
        effective_tables_total: number
      }>

      if (!results.length) {
        return jsonNoStore({ error: 'Today’s Best: all spot fetches failed' }, { status: 502 })
      }

      let fuelDebug: any = null
      if (home) {
        try {
          const targetsForDrive = results.map((r) => {
            const s: any = SURF_SPOTS[r.spotId] as any
            const lat = Number(s?.driveLat ?? r.lat)
            const lon = Number(s?.driveLon ?? r.lon)
            return { spotId: r.spotId, lat, lon }
          })

          const driveMap = await fetchDriveMinutesGeoapify(home, targetsForDrive)

          const drives = results
            .map((r) => driveMap[r.spotId])
            .filter((x) => Number.isFinite(x) && x >= 0) as number[]

          const minDrive = drives.length ? Math.min(...drives) : null

          for (const r of results) {
            const dm = driveMap[r.spotId]
            const base = Number(r.best?.tablesTotal ?? -Infinity)

            if (Number.isFinite(dm) && dm >= 0 && minDrive != null) {
              const extra = Math.max(0, dm - minDrive)
              const penalty = fuelPenaltyPointsFromMinutes(extra)
              r.drive_minutes = dm
              r.fuel_penalty_points = penalty
              r.effective_tables_total = base - penalty
            } else {
              r.drive_minutes = null
              r.fuel_penalty_points = 0
              r.effective_tables_total = base
            }
          }

          fuelDebug = {
            enabled: true,
            home,
            min_drive_minutes: minDrive,
            points_per_minute: FUEL_POINTS_PER_MIN,
            max_penalty_points: FUEL_MAX_PENALTY_POINTS,
          }
        } catch (e: any) {
          fuelDebug = {
            enabled: true,
            home,
            error: String(e?.message ?? e),
          }
        }
      }

      let overall = results[0]
      for (let i = 1; i < results.length; i++) {
        const a = overall.best
        const b = results[i].best

        const cmp = compareScored(a.scored, b.scored)
        if (cmp > 0) {
          overall = results[i]
          continue
        }
        if (cmp < 0) continue

        const aTot = overall.effective_tables_total
        const bTot = results[i].effective_tables_total

        if (bTot > aTot) {
          overall = results[i]
          continue
        }
        if (bTot < aTot) continue

        if (b.correctedHeight > a.correctedHeight) overall = results[i]
      }

      const chosen = overall
      const marineNow = chosen.best.marine
      const pickedNow = chosen.best.picked
      const scoredNow = chosen.best.scored
      const chosenUserExperiences = userExperiencesForSpot(userExpBySpotId, chosen.spotId)

      const [sun, dailyExtras, water] = await Promise.all([
        fetchSunTimes(chosen.lat, chosen.lon),
        fetchDailyExtras(chosen.lat, chosen.lon).catch(() => null as any),
        fetchWaterTempMinMaxToday(chosen.lat, chosen.lon).catch(() => ({ temp_min_c: null, temp_max_c: null })),
      ])

      const extras = dailyExtras as DailyExtras | null
      const air = extras?.air ?? { temp_min_c: null, temp_max_c: null }
      const weather = extras?.weather ?? { code: null, main: 'Cloudy' }
      const temp_c = extras?.temp_c ?? null
      const weather_label = extras?.weather_label ?? weather.main

      const chosenHeights: number[] = []
      for (let off = 0; off < hours; off++) {
        const b = makeBundleAt(chosen.series, off)
        const p = pickBestSwell({ spotKey: chosen.spotLabel, marine: b, userExperiences: chosenUserExperiences })
        const h = p.chosen === 'secondary' ? b.secondary.height_m : b.primary.height_m
        if (Number.isFinite(h)) chosenHeights.push(h)
      }

      let minH = 0
      let maxH = 0
      if (chosenHeights.length) {
        minH = Math.min(...chosenHeights)
        maxH = Math.max(...chosenHeights)
      }

      const st = getSpotTables(chosen.spotLabel)
      const waveHeightNow = pickedNow.chosen === 'secondary' ? marineNow.secondary.height_m : marineNow.primary.height_m

      const waveBucketRaw = bucketLabelFromRangeTable(st?.wave_height ?? [], waveHeightNow)
      const periodBucketRaw = bucketLabelFromRangeTable(
        st?.wave_period ?? [],
        pickedNow.chosen === 'secondary' ? marineNow.secondary.period_s : marineNow.primary.period_s
      )
      const windBucketRaw = bucketLabelFromRangeTable(st?.wind_speed ?? [], marineNow.wind_speed_ms)

      const bucketLabelForFrame = formatBucketLabelForUi(waveBucketRaw) ?? fmtRange(minH, maxH)

      const dayparts = daypartsOn
        ? buildDayparts(chosen.series, chosen.spotLabel, chosenUserExperiences)
        : undefined

      const daily = dailyOn
        ? buildDailyFrom4hWindows(chosen.series, chosen.spotLabel, days, chosenUserExperiences)
        : undefined

      return jsonNoStore({
        spot: chosen.spotLabel,
        spotId: chosen.spotId,
        geo: { lat: chosen.lat, lon: chosen.lon, source: 'todays_best', query: null },
        time_utc: marineNow.time_utc,

        sun: { sunrise: sun.sunrise, sunset: sun.sunset },
        air,
        water,
        weather,

        temp_c,
        weather_label,

        picked: { which: pickedNow.chosen },

        inputs: {
          time_utc: marineNow.time_utc,
          swell_height_m: waveHeightNow,
          swell_direction_deg:
            pickedNow.chosen === 'secondary'
              ? marineNow.secondary.direction_deg_from
              : marineNow.primary.direction_deg_from,
          swell_period_s: pickedNow.chosen === 'secondary' ? marineNow.secondary.period_s : marineNow.primary.period_s,
          wind_speed_ms: marineNow.wind_speed_ms,
          wind_direction_deg: marineNow.wind_direction_deg_from,
          primary_swell: marineNow.primary,
          secondary_swell: marineNow.secondary,
        },

        rating: scoredNow.rating,
        score: scoredNow.score,
        line1: scoredNow.line1,
        line2: scoredNow.line2,
        breakdown: scoredNow.breakdown,

        ui: {
          wave_bucket: formatBucketLabelForUi(waveBucketRaw) ?? waveBucketRaw,
          period_bucket: periodBucketRaw,
          wind_bucket: windBucketRaw,
        },

        forecast: {
          hours,
          wave_height_now_m: waveHeightNow,
          wave_height_min_m: minH,
          wave_height_max_m: maxH,
          wave_height_range_label: bucketLabelForFrame,
          wave_height_range_minmax_label: fmtRange(minH, maxH),
        },

        ...(daypartsOn ? { dayparts } : {}),
        ...(dailyOn ? { daily } : {}),

        debug: {
          auth: {
            has_bearer: hasBearer,
            chosen_user_experiences_for_spot: chosenUserExperiences.length,
            chosen_user_experience_ids: chosenUserExperiences.map((x) => x.id),
            chosen_user_experience_logged_at: chosenUserExperiences.map((x) => x.logged_at),
          },

          primary_rating: pickedNow.primaryScore?.rating ?? null,
          secondary_rating: pickedNow.secondaryScore?.rating ?? null,
          primary_total: pickedNow.primaryScore?.breakdown?.tables?.total ?? null,
          secondary_total: pickedNow.secondaryScore?.breakdown?.tables?.total ?? null,
          primary_blended_float: scoredBlendFloat(pickedNow.primaryScore),
          secondary_blended_float: scoredBlendFloat(pickedNow.secondaryScore),
          primary_confidence: scoredConfidence(pickedNow.primaryScore),
          secondary_confidence: scoredConfidence(pickedNow.secondaryScore),

          fuel_penalty: {
            enabled: !!home,
            applied: !!home && fuelDebug?.error == null,
            drive_minutes: chosen.drive_minutes,
            penalty_points: chosen.fuel_penalty_points,
            effective_tables_total: chosen.effective_tables_total,
            provider: 'geoapify',
            ...(fuelDebug ?? {}),
            cache_ttl_ms: DRIVE_CACHE_TTL_MS,
          },

          todays_best: {
            hours_window: hours,
            evaluated_spots: results.length,
            chosen_hour_offset: chosen.best.hourOffset,
          },

          ...(daypartsOn ? { dayparts: { enabled: true, tz: DAYPARTS_TZ, targets: DAYPART_TARGETS } } : {}),
          ...(dailyOn ? { daily: { enabled: true, tz: DAILY_TZ, days } } : {}),

          best_mode: { enabled: true, param: 'best', note: 'Today’s Best always uses best within window' },

          extras: {
            wx_cache_ttl_ms: WX_CACHE_TTL_MS,
            sst_cache_ttl_ms: SST_CACHE_TTL_MS,
          },
        },
      })
    }

    // ---------- Normal existing logic ----------

    let spotId: string | null = null
    let spotLabel: string | null = null
    let lat: number | null = null
    let lon: number | null = null
    let geoSource: string = 'unknown'
    let geoQuery: string | null = null

    if (latQ != null && lonQ != null) {
      lat = latQ
      lon = lonQ
      geoSource = 'query_latlon'
      spotId = spotIdQ || null
      spotLabel = spotQ || (spotId ? SURF_SPOTS[spotId]?.label ?? null : null)
    } else if (spotIdQ) {
      const s = SURF_SPOTS[spotIdQ]
      if (!s) return jsonNoStore({ error: 'Unknown spotId', spotId: spotIdQ }, { status: 400 })
      spotId = s.spotId
      spotLabel = s.label
      lat = s.lat
      lon = s.lon
      geoSource = 'spotId_map'
    } else if (spotQ) {
      const s = findSpotByLabel(spotQ)
      if (!s) {
        return jsonNoStore(
          { error: 'Unknown spot label (not in map). Use spotId.', spot: spotQ },
          { status: 400 }
        )
      }
      spotId = s.spotId
      spotLabel = s.label
      lat = s.lat
      lon = s.lon
      geoSource = 'label_map'
    } else {
      return jsonNoStore({ error: 'Missing ?spotId= or ?spot=' }, { status: 400 })
    }

    if (lat == null || lon == null) {
      return jsonNoStore({ error: 'No coordinates resolved' }, { status: 500 })
    }

    const series = await fetchMarineSeries(lat, lon)
    const spotUserExperiences = userExperiencesForSpot(userExpBySpotId, spotId)

    const [sun, dailyExtras, water] = await Promise.all([
      fetchSunTimes(lat, lon),
      fetchDailyExtras(lat, lon).catch(() => null as any),
      fetchWaterTempMinMaxToday(lat, lon).catch(() => ({ temp_min_c: null, temp_max_c: null })),
    ])

    const extras = dailyExtras as DailyExtras | null
    const air = extras?.air ?? { temp_min_c: null, temp_max_c: null }
    const weather = extras?.weather ?? { code: null, main: 'Cloudy' }
    const temp_c = extras?.temp_c ?? null
    const weather_label = extras?.weather_label ?? weather.main

    const spotKeyForTables = spotLabel ?? spotQ ?? spotId ?? 'Unknown'

    let marineNow: MarineBundle
    let pickedNow: ReturnType<typeof pickBestSwell>
    let scoredNow: any
    let chosenHourOffset = 0

    if (bestOn) {
      const best = bestWithinWindow(series, spotKeyForTables, hours, spotUserExperiences)
      marineNow = best.marine
      pickedNow = best.picked
      scoredNow = best.scored
      chosenHourOffset = best.hourOffset
    } else {
      marineNow = makeBundleAt(series, 0)
      pickedNow = pickBestSwell({ spotKey: spotKeyForTables, marine: marineNow, userExperiences: spotUserExperiences })
      scoredNow = pickedNow.chosenScore
      chosenHourOffset = 0
    }

    const chosenHeights: number[] = []
    for (let off = 0; off < hours; off++) {
      const b = makeBundleAt(series, off)
      const p = pickBestSwell({ spotKey: spotKeyForTables, marine: b, userExperiences: spotUserExperiences })
      const h = p.chosen === 'secondary' ? b.secondary.height_m : b.primary.height_m
      if (Number.isFinite(h)) chosenHeights.push(h)
    }

    let minH = 0
    let maxH = 0
    if (chosenHeights.length) {
      minH = Math.min(...chosenHeights)
      maxH = Math.max(...chosenHeights)
    }

    const st = getSpotTables(spotKeyForTables)
    const waveHeightNow = pickedNow.chosen === 'secondary' ? marineNow.secondary.height_m : marineNow.primary.height_m

    const waveBucketRaw = bucketLabelFromRangeTable(st?.wave_height ?? [], waveHeightNow)
    const periodBucketRaw = bucketLabelFromRangeTable(
      st?.wave_period ?? [],
      pickedNow.chosen === 'secondary' ? marineNow.secondary.period_s : marineNow.primary.period_s
    )
    const windBucketRaw = bucketLabelFromRangeTable(st?.wind_speed ?? [], marineNow.wind_speed_ms)

    const bucketLabelForFrame = formatBucketLabelForUi(waveBucketRaw) ?? fmtRange(minH, maxH)

    const dayparts = daypartsOn ? buildDayparts(series, spotKeyForTables, spotUserExperiences) : undefined
    const daily = dailyOn ? buildDailyFrom4hWindows(series, spotKeyForTables, days, spotUserExperiences) : undefined

    return jsonNoStore({
      spot: spotLabel ?? spotQ ?? spotId,
      spotId,
      geo: { lat, lon, source: geoSource, query: geoQuery },
      time_utc: marineNow.time_utc,

      sun: { sunrise: sun.sunrise, sunset: sun.sunset },
      air,
      water,
      weather,

      temp_c,
      weather_label,

      picked: { which: pickedNow.chosen },

      inputs: {
        time_utc: marineNow.time_utc,
        swell_height_m: waveHeightNow,
        swell_direction_deg:
          pickedNow.chosen === 'secondary' ? marineNow.secondary.direction_deg_from : marineNow.primary.direction_deg_from,
        swell_period_s: pickedNow.chosen === 'secondary' ? marineNow.secondary.period_s : marineNow.primary.period_s,
        wind_speed_ms: marineNow.wind_speed_ms,
        wind_direction_deg: marineNow.wind_direction_deg_from,
        primary_swell: marineNow.primary,
        secondary_swell: marineNow.secondary,
      },

      rating: scoredNow.rating,
      score: scoredNow.score,
      line1: scoredNow.line1,
      line2: scoredNow.line2,
      breakdown: scoredNow.breakdown,

      ui: {
        wave_bucket: formatBucketLabelForUi(waveBucketRaw) ?? waveBucketRaw,
        period_bucket: periodBucketRaw,
        wind_bucket: windBucketRaw,
      },

      forecast: {
        hours,
        wave_height_now_m: waveHeightNow,
        wave_height_min_m: minH,
        wave_height_max_m: maxH,
        wave_height_range_label: bucketLabelForFrame,
        wave_height_range_minmax_label: fmtRange(minH, maxH),
      },

      ...(daypartsOn ? { dayparts } : {}),
      ...(dailyOn ? { daily } : {}),

      debug: {
        auth: {
          has_bearer: hasBearer,
          user_experiences_for_spot: spotUserExperiences.length,
          user_experience_ids: spotUserExperiences.map((x) => x.id),
          user_experience_logged_at: spotUserExperiences.map((x) => x.logged_at),
        },

        primary_rating: pickedNow.primaryScore?.rating ?? null,
        secondary_rating: pickedNow.secondaryScore?.rating ?? null,
        primary_total: pickedNow.primaryScore?.breakdown?.tables?.total ?? null,
        secondary_total: pickedNow.secondaryScore?.breakdown?.tables?.total ?? null,
        primary_blended_float: scoredBlendFloat(pickedNow.primaryScore),
        secondary_blended_float: scoredBlendFloat(pickedNow.secondaryScore),
        primary_confidence: scoredConfidence(pickedNow.primaryScore),
        secondary_confidence: scoredConfidence(pickedNow.secondaryScore),

        ...(daypartsOn ? { dayparts: { enabled: true, tz: DAYPARTS_TZ, targets: DAYPART_TARGETS } } : {}),
        ...(dailyOn ? { daily: { enabled: true, tz: DAILY_TZ, days } } : {}),
        best_mode: {
          enabled: bestOn,
          hours,
          chosen_hour_offset: chosenHourOffset,
          note: bestOn ? 'Main rating/lines/time are best within window' : 'Main rating/lines/time are NOW (hourOffset=0)',
        },
        extras: {
          wx_cache_ttl_ms: WX_CACHE_TTL_MS,
          sst_cache_ttl_ms: SST_CACHE_TTL_MS,
        },
      },
    })
  } catch (e: any) {
    return jsonNoStore({ error: String(e?.message ?? e) }, { status: 500 })
  }
}