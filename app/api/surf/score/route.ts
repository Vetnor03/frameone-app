// app/api/surf/score/route.ts  (FULL FILE - copy/paste)
import { NextResponse } from 'next/server'
import { SURF_SPOTS, findSpotByLabel } from '@/app/lib/surf/spots'
import { scoreSurf, normalizeCustomSpotScoringProfile, type UserSurfExperienceRecord, type CustomSpotScoringProfile } from '@/app/lib/surfScoring'
import { normalizeSurfRating1to6, surfRatingIsExperienceBased, surfRatingVisual } from '@/app/lib/surf/ratings'
import TABLES from '@/app/lib/surf/waveguide_tables.json'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { type ForecastCacheDebug } from '@/app/lib/server/forecastCache'
import { buildOpenMeteoUrl, fetchOpenMeteoJson as fetchCachedOpenMeteoJson } from '@/app/lib/server/openMeteo'

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
const APP_FORECAST_TARGETS: Array<{ label: 'Morning' | 'Noon' | 'Evening'; hourLocal: number }> = [
  { label: 'Morning', hourLocal: 8 },
  { label: 'Noon', hourLocal: 12 },
  { label: 'Evening', hourLocal: 20 },
]


const OPEN_METEO_NORMAL_WIND_SPEED_FIELD = 'wind_speed_10m'
const OPEN_METEO_NORMAL_WIND_DIRECTION_FIELD = 'wind_direction_10m'
const OPEN_METEO_NORMAL_WIND_HOURLY_FIELDS = [OPEN_METEO_NORMAL_WIND_SPEED_FIELD, OPEN_METEO_NORMAL_WIND_DIRECTION_FIELD] as const

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
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      const err = new Error('timeout')
      ;(err as any).code = 'timeout'
      throw err
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}

type OpenMeteoSource = 'live' | 'stale_cache' | 'unavailable' // stale fallback returns source: 'stale_cache'
type OpenMeteoFetchResult<T = any> = {
  data: T | null
  source: OpenMeteoSource
  error: string | null
  cache_age_ms: number | null
  stale_expires_at: string | null
  cache_debug: ForecastCacheDebug | null
}
type SurfRequestContext = {
  configUpdatedAt?: string | null
  forceRefresh?: boolean
}

const OPEN_METEO_FORECAST_TIMEOUT_MS = 3500
const OPEN_METEO_MARINE_TIMEOUT_MS = 5000
const OPEN_METEO_CACHE_MAX_ENTRIES = 200
function createSurfRequestContext(input: Partial<SurfRequestContext> = {}): SurfRequestContext {
  return { configUpdatedAt: input.configUpdatedAt ?? null, forceRefresh: !!input.forceRefresh }
}

function pruneExpiringOpenMeteoCache<T>(cache: Map<string, { exp: number; v: T }>, now = Date.now()) {
  for (const [key, entry] of cache) {
    if (entry.exp <= now) cache.delete(key)
  }

  while (cache.size > OPEN_METEO_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) break
    cache.delete(oldestKey)
  }
}

async function fetchOpenMeteoJson(
  ctx: SurfRequestContext,
  url: string,
  opts: { timeoutMs: number; cacheTtlMs?: number; allowStale?: boolean; horizonHours?: number; forecastDays?: number; forecastRange?: string; frameRequest?: boolean; forceRefresh?: boolean; configUpdatedAt?: string | null }
): Promise<OpenMeteoFetchResult<any>> {
  const u = new URL(url)
  const endpoint = u.hostname.startsWith('marine-api') ? 'marine' : 'forecast'
  const fetched = await fetchCachedOpenMeteoJson({
    dataType: 'surf',
    endpoint,
    lat: Number(u.searchParams.get('latitude')),
    lon: Number(u.searchParams.get('longitude')),
    current: u.searchParams.get('current')?.split(','),
    hourly: u.searchParams.get('hourly')?.split(','),
    daily: u.searchParams.get('daily')?.split(','),
    timeoutMs: opts.timeoutMs,
    horizonHours: opts.horizonHours,
    forecastDays: opts.forecastDays ?? (u.searchParams.get('forecast_days') ? Number(u.searchParams.get('forecast_days')) : undefined),
    pastDays: u.searchParams.get('past_days') ? Number(u.searchParams.get('past_days')) : undefined,
    forecastRange: opts.forecastRange,
    timezone: u.searchParams.get('timezone') ?? undefined,
    params: Object.fromEntries(Array.from(u.searchParams.entries()).filter(([key]) => !['latitude', 'longitude', 'current', 'hourly', 'daily', 'forecast_days', 'past_days', 'timezone'].includes(key))),
    frameRequest: opts.frameRequest ?? true,
    allowStale: opts.allowStale,
    forceRefresh: opts.forceRefresh ?? ctx.forceRefresh ?? false,
    configUpdatedAt: opts.configUpdatedAt ?? ctx.configUpdatedAt ?? null,
    cacheTtlMs: opts.cacheTtlMs,
  })

  if (fetched.payload) {
    return {
      data: fetched.payload,
      source: fetched.debug.staleUsed ? 'stale_cache' : 'live',
      error: fetched.error,
      cache_age_ms: fetched.debug.cacheAgeMs,
      stale_expires_at: fetched.expiresAt,
      cache_debug: fetched.debug,
    }
  }

  return {
    data: null,
    source: 'unavailable',
    error: fetched.error,
    cache_age_ms: fetched.debug.cacheAgeMs,
    stale_expires_at: null,
    cache_debug: fetched.debug,
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

async function fetchSunTimes(lat: number, lon: number, ctx = createSurfRequestContext()): Promise<SunTimes> {
  const key = sunCacheKey(lat, lon)
  const now = Date.now()
  pruneExpiringOpenMeteoCache(__sunCache, now)
  const cached = __sunCache.get(key)
  if (cached && cached.exp > now) return cached.v

  const url = buildOpenMeteoUrl({ endpoint: 'forecast', lat, lon, daily: ['sunrise', 'sunset'], forecastDays: 1, timezone: 'Europe/Oslo' }).toString()

  const fetched = await fetchOpenMeteoJson(ctx, url, { timeoutMs: OPEN_METEO_FORECAST_TIMEOUT_MS, forecastDays: 1, forecastRange: '0-1d' })
  if (!fetched.data) return { sunrise: '--:--', sunset: '--:--' }

  const j: any = fetched.data
  const sunriseIso = j?.daily?.sunrise?.[0]
  const sunsetIso = j?.daily?.sunset?.[0]

  const v: SunTimes = {
    sunrise: hhmmFromIsoLocal(sunriseIso),
    sunset: hhmmFromIsoLocal(sunsetIso),
  }

  __sunCache.set(key, { exp: now + SUN_CACHE_TTL_MS, v })
  pruneExpiringOpenMeteoCache(__sunCache, now)
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

type DailyExtrasResult = DailyExtras & {
  source: OpenMeteoSource
  error: string | null
  cache_age_ms: number | null
  stale_expires_at: string | null
  cache_debug: ForecastCacheDebug | null
}

const WX_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const __wxCache =
  (globalThis as any).__surfWxCache || new Map<string, { exp: number; v: DailyExtrasResult }>()
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

async function fetchDailyExtras(lat: number, lon: number, ctx = createSurfRequestContext()): Promise<DailyExtrasResult> {
  const key = wxCacheKey(lat, lon)
  const now = Date.now()
  pruneExpiringOpenMeteoCache(__wxCache, now)
  const cached = __wxCache.get(key)
  if (cached && cached.exp > now) return { ...cached.v, source: cached.v.source ?? 'live', error: cached.v.error ?? null, cache_age_ms: cached.v.cache_age_ms ?? null, stale_expires_at: cached.v.stale_expires_at ?? null }

  const url = buildOpenMeteoUrl({ endpoint: 'forecast', lat, lon, daily: ['temperature_2m_min', 'temperature_2m_max', 'sunrise', 'sunset', 'weather_code'], forecastDays: 1, timezone: 'Europe/Oslo' }).toString()

  const fetched = await fetchOpenMeteoJson(ctx, url, { timeoutMs: OPEN_METEO_FORECAST_TIMEOUT_MS, forecastDays: 1, forecastRange: '0-1d' })
  if (!fetched.data) {
    return {
      sun: { sunrise: '--:--', sunset: '--:--' },
      air: { temp_min_c: null, temp_max_c: null },
      weather: { code: null, main: 'Cloudy' },
      temp_c: null,
      weather_label: 'Unavailable',
      source: 'unavailable',
      error: fetched.error,
      cache_age_ms: fetched.cache_age_ms,
      stale_expires_at: fetched.stale_expires_at,
      cache_debug: fetched.cache_debug,
    }
  }

  const j: any = fetched.data

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

  const v: DailyExtrasResult = {
    sun: { sunrise: hhmmFromIsoLocal(sunriseIso), sunset: hhmmFromIsoLocal(sunsetIso) },
    air: { temp_min_c: tminN, temp_max_c: tmaxN },
    weather: { code: codeN, main },
    temp_c,
    weather_label: main,
    source: fetched.source,
    error: fetched.error,
    cache_age_ms: fetched.cache_age_ms,
    stale_expires_at: fetched.stale_expires_at,
    cache_debug: fetched.cache_debug,
  }

  __wxCache.set(key, { exp: now + WX_CACHE_TTL_MS, v })
  pruneExpiringOpenMeteoCache(__wxCache, now)
  return v
}

// ------------------------------
// Water temp min/max (Open-Meteo Marine SST) — cached
// ------------------------------



async function resolveOwnerUserIdFromBearerToken(rawBearer: string): Promise<string | null> {
  const bearer = String(rawBearer || '').trim()
  if (!bearer) return null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return null

  if (bearerLooksLikeUserJwt(bearer)) {
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: { user } } = await userSupabase.auth.getUser()
    if (user?.id) return user.id
  } else {
    console.info('Bearer is not user JWT, trying device auth fallback')
  }

  const rawToken = rawTokenFromBearer(bearer)
  if (!rawToken) return null

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: deviceRow } = await adminSupabase
    .from('devices')
    .select('device_id')
    .eq('device_token_hash', tokenHash)
    .maybeSingle()

  if (!deviceRow?.device_id) return null

  const { data: memberRow } = await adminSupabase
    .from('device_members')
    .select('user_id, role')
    .eq('device_id', deviceRow.device_id)
    .eq('role', 'owner')
    .maybeSingle()

  return memberRow?.user_id ?? null
}
async function fetchCustomSpotById(req: Request, spotId: string) {
  const token = authBearerFromReq(req)
  if (!token) return null
  const userId = await resolveOwnerUserIdFromBearerToken(token)
  if (!userId) return null
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await supabaseAdmin
    .from('custom_surf_spots')
    .select('*')
    .eq('id', spotId)
    .eq('user_id', userId)
    .maybeSingle()
  return data || null
}

type CustomSurfSpotRow = {
  id: string
  name: string
  lat: number
  lon: number
  swell_sector_start_deg: number
  swell_sector_end_deg: number
  swell_main_deg: number
  wind_sector_start_deg: number
  wind_sector_end_deg: number
  wind_main_deg: number
}

function customSpotProfileFromRow(
  row: Pick<
    CustomSurfSpotRow,
    | 'swell_sector_start_deg'
    | 'swell_sector_end_deg'
    | 'swell_main_deg'
    | 'wind_sector_start_deg'
    | 'wind_sector_end_deg'
    | 'wind_main_deg'
  >
): CustomSpotScoringProfile {
  return normalizeCustomSpotScoringProfile({
    waveDir: {
      startDeg: Number(row.swell_sector_start_deg),
      endDeg: Number(row.swell_sector_end_deg),
      mainDeg: Number(row.swell_main_deg),
    },
    windDir: {
      startDeg: Number(row.wind_sector_start_deg),
      endDeg: Number(row.wind_sector_end_deg),
      mainDeg: Number(row.wind_main_deg),
    },
  }) ?? {}
}

async function fetchCustomSpotsForUser(req: Request): Promise<CustomSurfSpotRow[]> {
  const token = authBearerFromReq(req)
  if (!token) return []
  const userId = await resolveOwnerUserIdFromBearerToken(token)
  if (!userId) return []

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await supabaseAdmin
    .from('custom_surf_spots')
    .select('id, name, lat, lon, swell_sector_start_deg, swell_sector_end_deg, swell_main_deg, wind_sector_start_deg, wind_sector_end_deg, wind_main_deg')
    .eq('user_id', userId)

  if (error || !Array.isArray(data)) return []

  return data
    .map((row: any) => ({
      id: String(row?.id || '').trim(),
      name: String(row?.name || '').trim(),
      lat: Number(row?.lat),
      lon: Number(row?.lon),
      swell_sector_start_deg: Number(row?.swell_sector_start_deg),
      swell_sector_end_deg: Number(row?.swell_sector_end_deg),
      swell_main_deg: Number(row?.swell_main_deg),
      wind_sector_start_deg: Number(row?.wind_sector_start_deg),
      wind_sector_end_deg: Number(row?.wind_sector_end_deg),
      wind_main_deg: Number(row?.wind_main_deg),
    }))
    .filter((row) => row.id && row.name && Number.isFinite(row.lat) && Number.isFinite(row.lon))
}

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

async function fetchWaterTempMinMaxToday(lat: number, lon: number, ctx = createSurfRequestContext()): Promise<WaterMinMax> {
  const key = sstCacheKey(lat, lon)
  const now = Date.now()
  pruneExpiringOpenMeteoCache(__sstCache, now)
  const cached = __sstCache.get(key)
  if (cached && cached.exp > now) return cached.v

  const url = buildOpenMeteoUrl({ endpoint: 'marine', lat, lon, hourly: ['sea_surface_temperature'], timezone: 'Europe/Oslo', forecastDays: 1, params: { cell_selection: 'sea' } }).toString()

  const fetched = await fetchOpenMeteoJson(ctx, url, { timeoutMs: OPEN_METEO_MARINE_TIMEOUT_MS, forecastDays: 1, forecastRange: '0-1d' })
  if (!fetched.data) return { temp_min_c: null, temp_max_c: null }

  const j: any = fetched.data
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
  pruneExpiringOpenMeteoCache(__sstCache, now)
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
  fallback_used: boolean
  fallback_fields: string[]
}

type ForecastPoint = {
  requestLat: number
  requestLon: number
  lat: number
  lon: number
  gridKey: string
  source: 'open-meteo'
}

type ForecastCoordinateResolution = {
  inputLat: number
  inputLon: number
  requestLat: number
  requestLon: number
  source: 'exact'
  matchedSpotId: string | null
  matchedSpotLabel: string | null
  distanceKm: number | null
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
  forecastPoint: ForecastPoint
  coordinateResolution: ForecastCoordinateResolution
  marine_source: OpenMeteoSource
  marine_error: string | null
  marine_cache_age_ms: number | null
  marine_stale_expires_at: string | null
  marine_cache_debug: ForecastCacheDebug | null
  weather_source: OpenMeteoSource
  weather_error: string | null
  weather_cache_age_ms: number | null
  weather_stale_expires_at: string | null
  weather_cache_debug: ForecastCacheDebug | null
  wind_unavailable: boolean
}

const SECONDARY_MIN_M = 0.05
const MIN_USABLE_SWELL_HEIGHT_M = 0.35
const MIN_USABLE_SWELL_PERIOD_S = 5
const NEAR_FLAT_SWELL_HEIGHT_M = 0.3
const NEAR_FLAT_SWELL_PERIOD_S = 4
const CLEARLY_STRONGER_ENERGY_RATIO = 1.75
const CLEARLY_STRONGER_CORRECTED_M = 0.35

function toForecastNum(x: any) {
  const n = Number(x)
  return Number.isFinite(n) ? n : Number.NaN
}

function requireForecastNumber(value: number, field: string, timeUtc: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`Forecast data missing ${field} at ${timeUtc}`)
  }
  return value
}

function resolveForecastCoordinates(lat: number, lon: number): ForecastCoordinateResolution {
  // Preserve the caller's exact coordinates for the Open-Meteo request. In
  // particular, custom spots must not snap to nearby built-in surf spots: they
  // should use their own stored lat/lon and whichever forecast grid Open-Meteo
  // resolves for those coordinates.
  return {
    inputLat: lat,
    inputLon: lon,
    requestLat: lat,
    requestLon: lon,
    source: 'exact',
    matchedSpotId: null,
    matchedSpotLabel: null,
    distanceKm: null,
  }
}

function forecastGridKey(lat: number, lon: number) {
  return `${round6(lat)},${round6(lon)}`
}

function correctedHeightForPick(h: number, p: number) {
  if (!(h > 0) || !(p > 0)) return h
  return h * (p / 10)
}

type SwellPickMetrics = {
  height: number
  period: number
  correctedHeight: number
  usable: boolean
  nearFlat: boolean
}

function swellPickMetrics(swell: Sideswell): SwellPickMetrics {
  const height = Number.isFinite(swell.height_m) ? swell.height_m : 0
  const period = Number.isFinite(swell.period_s) ? swell.period_s : 0
  const correctedHeight = correctedHeightForPick(height, period)

  return {
    height,
    period,
    correctedHeight,
    usable: height >= MIN_USABLE_SWELL_HEIGHT_M && period >= MIN_USABLE_SWELL_PERIOD_S,
    nearFlat: height <= NEAR_FLAT_SWELL_HEIGHT_M || period <= NEAR_FLAT_SWELL_PERIOD_S,
  }
}

function clearlyStrongerEnergy(a: SwellPickMetrics, b: SwellPickMetrics) {
  if (!a.usable || a.correctedHeight <= 0) return false
  if (a.correctedHeight < b.correctedHeight + CLEARLY_STRONGER_CORRECTED_M) return false
  return a.correctedHeight >= Math.max(b.correctedHeight * CLEARLY_STRONGER_ENERGY_RATIO, CLEARLY_STRONGER_CORRECTED_M)
}

function selectedSwellFromPick(marine: MarineBundle, picked: { chosen: 'primary' | 'secondary' }) {
  return picked.chosen === 'secondary' ? marine.secondary : marine.primary
}

function selectedSwellIndex(picked: { chosen: 'primary' | 'secondary' }) {
  return picked.chosen === 'secondary' ? 2 : 1
}

function makeBundleAtIndexes(series: MarineSeries, marineIndex: number, windIndex: number): MarineBundle {
  const mi = clampInt(marineIndex, 0, series.mt.length - 1)
  const wi = clampInt(windIndex, 0, series.wt.length - 1)

  const timeUtc = series.mt[mi]
  const pH = requireForecastNumber(series.pH[mi], 'wave_height', timeUtc)
  const pD = requireForecastNumber(series.pD[mi], 'wave_direction', timeUtc)
  const pP = requireForecastNumber(series.pP[mi], 'wave_period', timeUtc)

  const sHRaw = series.sH[mi]
  const sDRaw = series.sD[mi]
  const sPRaw = series.sP[mi]
  const sH = Number.isFinite(sHRaw) ? sHRaw : 0
  const sD = Number.isFinite(sDRaw) ? sDRaw : 0
  const sP = Number.isFinite(sPRaw) ? sPRaw : 0

  const fallbackFields: string[] = []
  if (sH >= SECONDARY_MIN_M && (!Number.isFinite(sDRaw) || !Number.isFinite(sPRaw))) {
    if (!Number.isFinite(sDRaw)) fallbackFields.push('secondary_swell_wave_direction')
    if (!Number.isFinite(sPRaw)) fallbackFields.push('secondary_swell_wave_period')
  }

  const windTimeUtc = series.wt[wi] ?? timeUtc
  const wind_speed = requireForecastNumber(series.windS[wi], OPEN_METEO_NORMAL_WIND_SPEED_FIELD, windTimeUtc)
  const wind_dir = requireForecastNumber(series.windD[wi], OPEN_METEO_NORMAL_WIND_DIRECTION_FIELD, windTimeUtc)
  if (series.wind_unavailable) {
    fallbackFields.push(OPEN_METEO_NORMAL_WIND_SPEED_FIELD, OPEN_METEO_NORMAL_WIND_DIRECTION_FIELD)
  }

  const secondaryPresent = sH >= SECONDARY_MIN_M && Number.isFinite(sDRaw) && Number.isFinite(sPRaw)

  return {
    time_utc: timeUtc,
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
    fallback_used: fallbackFields.length > 0,
    fallback_fields: fallbackFields,
  }
}

function makeBundleAt(series: MarineSeries, hourOffset: number): MarineBundle {
  const mi = clampInt(series.mi + hourOffset, 0, series.mt.length - 1)
  const targetTimeUtc = series.mt[mi] ?? series.mt[series.mi] ?? isoHourUTC()
  const wi = nearestHourIndex(series.wt, targetTimeUtc)
  return makeBundleAtIndexes(series, mi, wi)
}

async function fetchMarineSeries(lat: number, lon: number, ctx = createSurfRequestContext()): Promise<MarineSeries> {
  const timeHour = isoHourUTC()
  const coord = resolveForecastCoordinates(lat, lon)
  const requestLat = coord.requestLat
  const requestLon = coord.requestLon

  const marineUrl = buildOpenMeteoUrl({
    endpoint: 'marine',
    lat: requestLat,
    lon: requestLon,
    hourly: ['wave_height', 'wave_direction', 'wave_period', 'secondary_swell_wave_height', 'secondary_swell_wave_direction', 'secondary_swell_wave_period'],
    timezone: 'UTC',
    forecastDays: 7,
    params: { cell_selection: 'sea' },
  }).toString()

  const windUrl = buildOpenMeteoUrl({
    endpoint: 'forecast',
    lat: requestLat,
    lon: requestLon,
    hourly: [...OPEN_METEO_NORMAL_WIND_HOURLY_FIELDS],
    timezone: 'UTC',
    forecastDays: 7,
    params: { wind_speed_unit: 'ms' },
  }).toString()

  const [marineFetched, windFetched] = await Promise.all([
    fetchOpenMeteoJson(ctx, marineUrl, { timeoutMs: OPEN_METEO_MARINE_TIMEOUT_MS, forecastDays: 7, forecastRange: '0-7d' }),
    fetchOpenMeteoJson(ctx, windUrl, { timeoutMs: OPEN_METEO_FORECAST_TIMEOUT_MS, forecastDays: 7, forecastRange: '0-7d' }),
  ])
  if (!marineFetched.data) throw new Error(`Marine fetch failed${marineFetched.error ? `: ${marineFetched.error}` : ''}`)

  const marine = marineFetched.data
  const wind = windFetched.data

  const mt: string[] = marine?.hourly?.time ?? []
  const wtRaw: string[] = wind?.hourly?.time ?? []
  if (!Array.isArray(mt) || !mt.length) throw new Error('Marine data missing time')
  const wt: string[] = Array.isArray(wtRaw) && wtRaw.length ? wtRaw : mt

  const mi = nearestHourIndex(mt, timeHour)
  const wi = nearestHourIndex(wt, timeHour)
  const windUnavailable = !windFetched.data

  const pH: number[] = Array.isArray(marine?.hourly?.wave_height) ? marine.hourly.wave_height.map(toForecastNum) : []
  const pD: number[] = Array.isArray(marine?.hourly?.wave_direction) ? marine.hourly.wave_direction.map(toForecastNum) : []
  const pP: number[] = Array.isArray(marine?.hourly?.wave_period) ? marine.hourly.wave_period.map(toForecastNum) : []

  const sH: number[] = Array.isArray(marine?.hourly?.secondary_swell_wave_height)
    ? marine.hourly.secondary_swell_wave_height.map(toForecastNum)
    : []
  const sD: number[] = Array.isArray(marine?.hourly?.secondary_swell_wave_direction)
    ? marine.hourly.secondary_swell_wave_direction.map(toForecastNum)
    : []
  const sP: number[] = Array.isArray(marine?.hourly?.secondary_swell_wave_period)
    ? marine.hourly.secondary_swell_wave_period.map(toForecastNum)
    : []

  const windS: number[] = Array.isArray(wind?.hourly?.[OPEN_METEO_NORMAL_WIND_SPEED_FIELD])
    ? wind.hourly[OPEN_METEO_NORMAL_WIND_SPEED_FIELD].map(toForecastNum)
    : mt.map(() => 0)
  const windD: number[] = Array.isArray(wind?.hourly?.[OPEN_METEO_NORMAL_WIND_DIRECTION_FIELD])
    ? wind.hourly[OPEN_METEO_NORMAL_WIND_DIRECTION_FIELD].map(toForecastNum)
    : mt.map(() => 0)

  const gridLat = Number(marine?.latitude)
  const gridLon = Number(marine?.longitude)
  const forecastPoint: ForecastPoint = {
    requestLat,
    requestLon,
    lat: Number.isFinite(gridLat) ? gridLat : requestLat,
    lon: Number.isFinite(gridLon) ? gridLon : requestLon,
    gridKey: forecastGridKey(Number.isFinite(gridLat) ? gridLat : requestLat, Number.isFinite(gridLon) ? gridLon : requestLon),
    source: 'open-meteo',
  }

  return {
    mt,
    wt,
    mi,
    wi,
    pH,
    pD,
    pP,
    sH,
    sD,
    sP,
    windS,
    windD,
    forecastPoint,
    coordinateResolution: coord,
    marine_source: marineFetched.source,
    marine_error: marineFetched.error,
    marine_cache_age_ms: marineFetched.cache_age_ms,
    marine_stale_expires_at: marineFetched.stale_expires_at,
    marine_cache_debug: marineFetched.cache_debug,
    weather_source: windFetched.source,
    weather_error: windFetched.error,
    weather_cache_age_ms: windFetched.cache_age_ms,
    weather_stale_expires_at: windFetched.stale_expires_at,
    weather_cache_debug: windFetched.cache_debug,
    wind_unavailable: windUnavailable,
  }
}

/** ---------- User experience fetch ---------- **/

type UserExpMap = Record<string, UserSurfExperienceRecord[]>


function rawTokenFromBearer(bearer: string) {
  return String(bearer || '').replace(/^Bearer\s+/i, '').trim()
}

function bearerLooksLikeUserJwt(bearer: string) {
  const token = rawTokenFromBearer(bearer)
  const parts = token.split('.')
  return parts.length === 3 && parts.every(Boolean)
}

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

  let userSupabase: ReturnType<typeof createClient> | null = null
  let ownerUserId: string | null = null

  if (bearerLooksLikeUserJwt(bearer)) {
    userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
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
    ownerUserId = user?.id ?? null
  } else {
    console.info('Bearer is not user JWT, trying device auth fallback')
  }

  if (!ownerUserId) {
    const rawToken = rawTokenFromBearer(bearer)
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

  if (!userSupabase) return out

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

  for (const row of data as any[]) {
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

function swellDirectionScore(scored: ReturnType<typeof scoreSurf> | null | undefined) {
  const score = Number(scored?.breakdown?.tables?.wave_dir?.score)
  return Number.isFinite(score) ? score : null
}

function swellCombinedScore(scored: ReturnType<typeof scoreSurf> | null | undefined) {
  const total = Number(scored?.breakdown?.tables?.total)
  return Number.isFinite(total) ? total : null
}

function swellSelectionDebug(args: {
  marine: MarineBundle
  selected: Sideswell
  selectedSource: 'primary' | 'secondary'
  primaryScore: ReturnType<typeof scoreSurf>
  secondaryScore?: ReturnType<typeof scoreSurf> | null
}) {
  const { marine, selected, selectedSource, primaryScore, secondaryScore } = args
  const secondaryPresent = marine.secondary.present

  return {
    selected_swell_source: selectedSource,
    primary_swell_direction_deg_from: marine.primary.direction_deg_from,
    primary_swell_height_m: marine.primary.height_m,
    primary_swell_period_s: marine.primary.period_s,
    primary_swell_direction_score: swellDirectionScore(primaryScore),
    primary_combined_score: swellCombinedScore(primaryScore),
    secondary_swell_direction_deg_from: secondaryPresent ? marine.secondary.direction_deg_from : null,
    secondary_swell_height_m: secondaryPresent ? marine.secondary.height_m : null,
    secondary_swell_period_s: secondaryPresent ? marine.secondary.period_s : null,
    secondary_swell_direction_score: secondaryPresent ? swellDirectionScore(secondaryScore) : null,
    secondary_combined_score: secondaryPresent ? swellCombinedScore(secondaryScore) : null,
    selected_swell_height_m: selected.height_m,
    selected_swell_period_s: selected.period_s,
    selected_swell_direction_deg_from: selected.direction_deg_from,
  }
}

function pickBestSwell(args: {
  spotKey: string
  marine: MarineBundle
  userExperiences?: UserSurfExperienceRecord[]
  customSpotProfile?: CustomSpotScoringProfile | null
}) {
  const { spotKey, marine, userExperiences, customSpotProfile } = args

  const windSpeedMs = marine.wind_speed_ms
  const windDirDeg = marine.wind_direction_deg_from
  const primaryMetrics = swellPickMetrics(marine.primary)
  const secondaryMetrics = swellPickMetrics(marine.secondary)

  const primaryScore = scoreSurf({
    spotKey,
    swellHeightM: marine.primary.height_m,
    swellPeriodS: marine.primary.period_s,
    swellDirDeg: marine.primary.direction_deg_from,
    windSpeedMs,
    windDirDeg,
    userExperiences,
    customSpotProfile,
  })

  const withDebug = <T extends {
    chosen: 'primary' | 'secondary'
    chosenScore: ReturnType<typeof scoreSurf>
    primaryScore: ReturnType<typeof scoreSurf>
    secondaryScore?: ReturnType<typeof scoreSurf> | null
  }>(
    picked: T,
    whySelected: string
  ) => {
    const main = selectedSwellFromPick(marine, picked)
    const mainIndex = selectedSwellIndex(picked)
    const combinedScore = scoreSurf({
      spotKey,
      swellHeightM: main.height_m,
      swellPeriodS: main.period_s,
      swellDirDeg: main.direction_deg_from,
      windSpeedMs,
      windDirDeg,
      selectedMainSwellIndex: mainIndex,
      swells: [
        {
          index: 1,
          height_m: marine.primary.height_m,
          period_s: marine.primary.period_s,
          direction_deg_from: marine.primary.direction_deg_from,
        },
        ...(marine.secondary.present
          ? [{
              index: 2,
              height_m: marine.secondary.height_m,
              period_s: marine.secondary.period_s,
              direction_deg_from: marine.secondary.direction_deg_from,
            }]
          : []),
      ],
      forecastTimeUtc: marine.time_utc,
      whySelected,
      userExperiences,
      customSpotProfile,
    })

    const selectionDebug = swellSelectionDebug({
      marine,
      selected: main,
      selectedSource: picked.chosen,
      primaryScore: picked.primaryScore,
      secondaryScore: picked.secondaryScore,
    })

    return {
      ...picked,
      chosenScore: combinedScore,
      selectedSwellIndex: mainIndex,
      selectedMainSwellIndex: mainIndex,
      contributingSwellIndexes: combinedScore.breakdown?.contributingSwellIndexes ?? [mainIndex],
      swellMixSignature: combinedScore.breakdown?.swellMixSignature ?? null,
      experienceMatchType: combinedScore.breakdown?.experienceMatchType ?? 'none',
      experienceConfidence: combinedScore.breakdown?.experienceConfidence ?? 0,
      modelRating: combinedScore.breakdown?.modelRating ?? combinedScore.rating,
      experienceRating: combinedScore.breakdown?.experienceRating ?? null,
      finalRating: combinedScore.breakdown?.finalRating ?? combinedScore.rating,
      selectedSwellHeight: main.height_m,
      selectedSwellPeriod: main.period_s,
      selectedSwellDirection: main.direction_deg_from,
      ratingSource: scoredExperienceMatched(combinedScore) ? 'experience_blend' : 'tables',
      displayHeightSource: picked.chosen,
      whySelected,
      selectionDebug,
      ...selectionDebug,
      primaryMetrics,
      secondaryMetrics,
    }
  }

  if (!marine.secondary.present) {
    return withDebug(
      {
        chosen: 'primary' as const,
        chosenScore: primaryScore,
        secondaryScore: null,
        primaryScore,
      },
      'secondary swell not present'
    )
  }

  const secondaryScore = scoreSurf({
    spotKey,
    swellHeightM: marine.secondary.height_m,
    swellPeriodS: marine.secondary.period_s,
    swellDirDeg: marine.secondary.direction_deg_from,
    windSpeedMs,
    windDirDeg,
    userExperiences,
    customSpotProfile,
  })

  const pickPrimary = (whySelected: string) =>
    withDebug(
      {
        chosen: 'primary' as const,
        chosenScore: primaryScore,
        secondaryScore,
        primaryScore,
      },
      whySelected
    )

  const pickSecondary = (whySelected: string) =>
    withDebug(
      {
        chosen: 'secondary' as const,
        chosenScore: secondaryScore,
        secondaryScore,
        primaryScore,
      },
      whySelected
    )

  if (normalizeCustomSpotScoringProfile(customSpotProfile)) {
    const customCmp = betterByScoredThenHeight({
      scoredA: primaryScore,
      scoredB: secondaryScore,
      correctedHeightA: primaryMetrics.correctedHeight,
      correctedHeightB: secondaryMetrics.correctedHeight,
    })

    if (customCmp > 0) return pickSecondary('custom spot secondary scored higher with custom sector profile')

    return pickPrimary(
      customCmp < 0
        ? 'custom spot primary scored higher with custom sector profile'
        : 'custom spot scores tied with custom sector profile; primary fallback'
    )
  }

  if (primaryMetrics.usable && secondaryMetrics.nearFlat) {
    return pickPrimary('primary usable; secondary is near-flat/short-period')
  }

  if (secondaryMetrics.usable && primaryMetrics.nearFlat) {
    return pickSecondary('secondary usable; primary is near-flat/short-period')
  }

  if (clearlyStrongerEnergy(primaryMetrics, secondaryMetrics)) {
    return pickPrimary('primary has clearly stronger usable energy')
  }

  if (clearlyStrongerEnergy(secondaryMetrics, primaryMetrics)) {
    return pickSecondary('secondary has clearly stronger usable energy')
  }

  const cmp = betterByScoredThenHeight({
    scoredA: primaryScore,
    scoredB: secondaryScore,
    correctedHeightA: primaryMetrics.correctedHeight,
    correctedHeightB: secondaryMetrics.correctedHeight,
  })

  if (cmp > 0) return pickSecondary('scores comparable after usable-energy gates; secondary scored higher')

  return pickPrimary(
    cmp < 0 ? 'scores comparable after usable-energy gates; primary scored higher' : 'scores tied; primary fallback'
  )
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

function rangeTableBucketMatches(bucket: any, value: number) {
  const mnRaw = bucket?.min
  const mxRaw = bucket?.max
  const mn = mnRaw === null || mnRaw === undefined ? Number.NEGATIVE_INFINITY : Number(mnRaw)
  const mx = mxRaw === null || mxRaw === undefined ? Number.POSITIVE_INFINITY : Number(mxRaw)
  if (!Number.isFinite(mn) || !Number.isFinite(mx)) return false
  const minMatches = bucket?.min_exclusive === true ? value > mn : value >= mn
  const maxMatches = bucket?.max_inclusive === true ? value <= mx : value < mx
  return minMatches && maxMatches
}

function bucketLabelFromRangeTable(arrRaw: any[], value: number): string | null {
  if (!Array.isArray(arrRaw) || !arrRaw.length) return null
  const v = Number.isFinite(value) ? value : 0

  const arr = [...arrRaw].sort((a, b) => Number(a?.min ?? Number.NEGATIVE_INFINITY) - Number(b?.min ?? Number.NEGATIVE_INFINITY))

  for (const b of arr) {
    const mnRaw = b?.min
    const mxRaw = b?.max
    const mn = mnRaw === null || mnRaw === undefined ? Number.NEGATIVE_INFINITY : Number(mnRaw)
    const mx = mxRaw === null || mxRaw === undefined ? Number.POSITIVE_INFINITY : Number(mxRaw)
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) continue
    const minMatches = b?.min_exclusive === true ? v > mn : v >= mn
    const maxMatches = b?.max_inclusive === true ? v <= mx : v < mx
    if (minMatches && maxMatches) {
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

function degToCompass8(deg: number) {
  if (!Number.isFinite(deg)) return 'N'
  const d = ((deg % 360) + 360) % 360
  if (d >= 337.5 || d < 22.5) return 'N'
  if (d < 67.5) return 'NE'
  if (d < 112.5) return 'E'
  if (d < 157.5) return 'SE'
  if (d < 202.5) return 'S'
  if (d < 247.5) return 'SW'
  if (d < 292.5) return 'W'
  return 'NW'
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
  scored: ReturnType<typeof scoreSurf>
  tablesTotal: number
  correctedHeight: number
  blendedFloat: number
  confidence: number
}

type NormalizedSurfCondition = {
  hourOffset: number
  marine: MarineBundle
  picked: ReturnType<typeof pickBestSwell>
  scored: ReturnType<typeof scoreSurf>
}

function currentNormalizedCondition(
  series: MarineSeries,
  spotKey: string,
  userExperiences: UserSurfExperienceRecord[],
  customSpotProfile?: CustomSpotScoringProfile | null
): NormalizedSurfCondition {
  const marine = makeBundleAt(series, 0)
  const picked = pickBestSwell({ spotKey, marine, userExperiences, customSpotProfile })
  return { hourOffset: 0, marine, picked, scored: picked.chosenScore }
}

function bestNormalizedCondition(
  series: MarineSeries,
  spotKey: string,
  hours: number,
  userExperiences: UserSurfExperienceRecord[],
  customSpotProfile?: CustomSpotScoringProfile | null
): NormalizedSurfCondition {
  const best = bestWithinWindow(series, spotKey, hours, userExperiences, customSpotProfile)
  return { hourOffset: best.hourOffset, marine: best.marine, picked: best.picked, scored: best.scored }
}

function spotKeyForResolvedForecast(
  fallbackSpotKey: string,
  _series: MarineSeries,
  _customSpotProfile: CustomSpotScoringProfile | null
) {
  return fallbackSpotKey
}

function scoringProfileForResolvedForecast(
  _series: MarineSeries,
  customSpotProfile: CustomSpotScoringProfile | null
) {
  // Custom spot sectors are scoring inputs only. They should affect the
  // rating/score while the raw displayed wave, period, and wind values continue
  // to come directly from the forecast bundle selected for the spot's own grid.
  return customSpotProfile
}

function surfDebugConditionLog(args: {
  spotId: string | null
  spotName: string | null
  lat: number
  lon: number
  series: MarineSeries
  condition: NormalizedSurfCondition
  finalRating: number | null
  compareToSpotId?: string | null
  compareToSpotName?: string | null
  spotKey: string
  cardMode: 'current' | 'best_next_4h'
  displayedSwell?: Sideswell
  displayedWindSpeedMs?: number
  displayedWindDirectionDegFrom?: number
  displayedWaveLabel?: string | null
  displayedPeriodS?: number | null
  displayedWindSpeedRoundedMs?: number | null
}) {
  const selected = selectedSwellFromPick(args.condition.marine, args.condition.picked)
  const displayed = args.displayedSwell ?? selected
  const scoredTables = args.condition.scored?.breakdown?.tables ?? null
  const profile = args.condition.scored?.breakdown?.custom_spot_scoring_profile ?? null
  console.info(args.cardMode === 'current' ? '[surf-score:current-card]' : '[surf-score:condition]', {
    spot_id: args.spotId,
    spot_name: args.spotName,
    lat: args.lat,
    lon: args.lon,
    compare_to_spot_id: args.compareToSpotId ?? args.series.coordinateResolution.matchedSpotId,
    compare_to_spot_name: args.compareToSpotName ?? args.series.coordinateResolution.matchedSpotLabel,
    card_mode: args.cardMode,
    scoring_spot_key: args.spotKey,
    scoring_spot_type: profile ? 'custom' : 'normal',
    direction_profile_source: scoredTables?.direction_profile_source ?? (profile ? 'custom_sector' : 'spot_specific_table'),
    range_profile_source: scoredTables?.range_profile_source ?? (profile ? 'global_custom_generic' : 'spot_specific_table'),
    range_profile_spot_used: scoredTables?.range_profile_spot_used ?? (profile ? 'GLOBAL_CUSTOM_SPOT' : args.spotKey),
    height_score_source: scoredTables?.wave_height?.source ?? null,
    period_score_source: scoredTables?.wave_period?.source ?? null,
    wind_speed_score_source: scoredTables?.wind_speed?.source ?? null,
    fallback_default_profile_used: scoredTables?.fallback_default_profile_used ?? false,
    custom_sector_config_loaded: !!profile,
    swell_sector_start: profile?.waveDir?.startDeg ?? null,
    swell_sector_end: profile?.waveDir?.endDeg ?? null,
    swell_best_direction: profile?.waveDir?.mainDeg ?? null,
    selected_timestamp: args.condition.marine.time_utc,
    selected_timestamp_bucket: args.condition.marine.time_utc,
    selected_hour_offset: args.condition.hourOffset,
    resolved_forecast_point: {
      source: args.series.forecastPoint.source,
      request_lat: args.series.forecastPoint.requestLat,
      request_lon: args.series.forecastPoint.requestLon,
      resolved_lat: args.series.forecastPoint.lat,
      resolved_lon: args.series.forecastPoint.lon,
      grid_key: args.series.forecastPoint.gridKey,
      coordinate_resolution: args.series.coordinateResolution,
    },
    forecast: {
      source: args.series.forecastPoint.source,
      request_lat: args.series.forecastPoint.requestLat,
      request_lon: args.series.forecastPoint.requestLon,
      resolved_lat: args.series.forecastPoint.lat,
      resolved_lon: args.series.forecastPoint.lon,
      grid_key: args.series.forecastPoint.gridKey,
      coordinate_resolution: args.series.coordinateResolution,
    },
    raw_wave_height_m: displayed.height_m,
    raw_period_s: displayed.period_s,
    raw_swell_direction_deg_from: displayed.direction_deg_from,
    raw_wind_speed_ms: args.displayedWindSpeedMs ?? args.condition.marine.wind_speed_ms,
    raw_wind_direction_deg_from: args.displayedWindDirectionDegFrom ?? args.condition.marine.wind_direction_deg_from,
    selected_swell_source: args.condition.picked.selected_swell_source ?? args.condition.picked.chosen,
    primary_swell_direction_deg_from: args.condition.picked.primary_swell_direction_deg_from ?? args.condition.marine.primary.direction_deg_from,
    primary_swell_height_m: args.condition.picked.primary_swell_height_m ?? args.condition.marine.primary.height_m,
    primary_swell_period_s: args.condition.picked.primary_swell_period_s ?? args.condition.marine.primary.period_s,
    primary_swell_direction_score: args.condition.picked.primary_swell_direction_score ?? null,
    primary_combined_score: args.condition.picked.primary_combined_score ?? null,
    secondary_swell_direction_deg_from: args.condition.picked.secondary_swell_direction_deg_from ?? (args.condition.marine.secondary.present ? args.condition.marine.secondary.direction_deg_from : null),
    secondary_swell_height_m: args.condition.picked.secondary_swell_height_m ?? (args.condition.marine.secondary.present ? args.condition.marine.secondary.height_m : null),
    secondary_swell_period_s: args.condition.picked.secondary_swell_period_s ?? (args.condition.marine.secondary.present ? args.condition.marine.secondary.period_s : null),
    secondary_swell_direction_score: args.condition.picked.secondary_swell_direction_score ?? null,
    secondary_combined_score: args.condition.picked.secondary_combined_score ?? null,
    selected_swell_height_m: args.condition.picked.selected_swell_height_m ?? selected.height_m,
    selected_swell_period_s: args.condition.picked.selected_swell_period_s ?? selected.period_s,
    selected_swell_direction_deg_from: args.condition.picked.selected_swell_direction_deg_from ?? selected.direction_deg_from,
    wave_height_m: selected.height_m,
    wave_period_s: selected.period_s,
    swell_direction_deg_from: selected.direction_deg_from,
    swell_direction_score: scoredTables?.wave_dir?.score ?? null,
    wind_speed_ms: args.condition.marine.wind_speed_ms,
    wind_sector_start: profile?.windDir?.startDeg ?? null,
    wind_sector_end: profile?.windDir?.endDeg ?? null,
    wind_best_direction: profile?.windDir?.mainDeg ?? null,
    wind_direction_deg_from: args.condition.marine.wind_direction_deg_from,
    wind_direction_score: scoredTables?.wind_dir?.score ?? null,
    raw_wind_direction_score: scoredTables?.wind_dir?.raw_wind_direction_score ?? null,
    effective_wind_direction_score: scoredTables?.wind_dir?.effective_wind_direction_score ?? null,
    wind_direction_weight_multiplier: scoredTables?.wind_dir?.wind_direction_weight_multiplier ?? null,
    calm_wind_weighting_applied: scoredTables?.wind_dir?.calm_wind_weighting_applied ?? false,
    height_score: scoredTables?.wave_height?.score ?? null,
    period_score: scoredTables?.wave_period?.score ?? null,
    wind_speed_score: scoredTables?.wind_speed?.score ?? null,
    tide_score: null,
    raw_component_scores: scoredTables ? {
      swell_direction: scoredTables.wave_dir?.score ?? null,
      height: scoredTables.wave_height?.score ?? null,
      period: scoredTables.wave_period?.score ?? null,
      wind_speed: scoredTables.wind_speed?.score ?? null,
      wind_direction: scoredTables.wind_dir?.score ?? null,
      raw_wind_direction: scoredTables.wind_dir?.raw_wind_direction_score ?? null,
      effective_wind_direction: scoredTables.wind_dir?.effective_wind_direction_score ?? null,
      wind_direction_weight_multiplier: scoredTables.wind_dir?.wind_direction_weight_multiplier ?? null,
      calm_wind_weighting_applied: scoredTables.wind_dir?.calm_wind_weighting_applied ?? false,
      weighted_total: scoredTables.total ?? null,
      label: scoredTables.label ?? null,
    } : null,
    displayed_wave: args.displayedWaveLabel ?? (Number.isFinite(displayed.height_m) ? `${displayed.height_m.toFixed(1)}m` : null),
    displayed_period_s: args.displayedPeriodS ?? (Number.isFinite(displayed.period_s) ? Math.round(displayed.period_s) : null),
    displayed_wind_speed_ms: args.displayedWindSpeedRoundedMs ?? (Number.isFinite(args.displayedWindSpeedMs ?? args.condition.marine.wind_speed_ms) ? Math.round(args.displayedWindSpeedMs ?? args.condition.marine.wind_speed_ms) : null),
    final_rating: args.finalRating,
  })
}

function bestWithinWindow(
  series: MarineSeries,
  spotKeyForTables: string,
  hours: number,
  userExperiences: UserSurfExperienceRecord[],
  customSpotProfile?: CustomSpotScoringProfile | null
): BestPick {
  let best: BestPick | null = null

  for (let off = 0; off < hours; off++) {
    const marine = makeBundleAt(series, off)
    const picked = pickBestSwell({ spotKey: spotKeyForTables, marine, userExperiences, customSpotProfile })
    const scored = picked.chosenScore

    const tablesTotal = scoredTablesTotal(scored)
    const chosenH = selectedSwellFromPick(marine, picked).height_m
    const chosenP = selectedSwellFromPick(marine, picked).period_s
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
  const targetWi = nearestHourIndex(series.wt, targetIsoHourUtc)
  return makeBundleAtIndexes(series, targetMi, targetWi)
}

function exactHourIndex(times: string[], targetIsoHourUtc: string) {
  return times.indexOf(targetIsoHourUtc)
}

type WaveHeightBucket = {
  label?: string
  min?: number
  max?: number | null
  score_1_6?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function defaultWaveHeightTable(): WaveHeightBucket[] {
  const tablesRecord: Record<string, unknown> = isRecord(TABLES) ? TABLES : {}
  const spotsMap = isRecord(tablesRecord.spots) ? tablesRecord.spots : null
  if (!spotsMap) return []

  for (const spot of Object.values(spotsMap)) {
    if (!isRecord(spot)) continue
    const waveHeight = spot.wave_height
    if (Array.isArray(waveHeight) && waveHeight.length) return waveHeight as WaveHeightBucket[]
  }

  return []
}

function waveHeightTableForSpot(spotKeyForTables: string): WaveHeightBucket[] {
  const st = getSpotTables(spotKeyForTables)
  const spotWaveHeight = st?.wave_height
  if (Array.isArray(spotWaveHeight) && spotWaveHeight.length) return spotWaveHeight as WaveHeightBucket[]

  // Custom/private spots do not have per-spot wave-height tables, but they should
  // still display the same rounded-up height ranges used by built-in spots.
  return defaultWaveHeightTable()
}

function waveHeightBucketRawForValue(spotKeyForTables: string, waveHeight: number) {
  return bucketLabelFromRangeTable(waveHeightTableForSpot(spotKeyForTables), waveHeight)
}

function waveHeightLabelForValue(spotKeyForTables: string, waveHeight: number) {
  const raw = waveHeightBucketRawForValue(spotKeyForTables, waveHeight)
  return formatBucketLabelForUi(raw) ?? fmtRange(waveHeight, waveHeight)
}

function waveHeightBucketMinMaxForValue(spotKeyForTables: string, waveHeight: number) {
  const bucket = waveHeightTableForSpot(spotKeyForTables).find((b) => rangeTableBucketMatches(b, waveHeight))
  if (!bucket) return { min: waveHeight, max: waveHeight, label: fmtRange(waveHeight, waveHeight) }
  const min = Number(bucket.min)
  const maxRaw = bucket.max
  const max = maxRaw === null || maxRaw === undefined ? null : Number(maxRaw)
  return {
    min: Number.isFinite(min) ? min : waveHeight,
    max: max === null || Number.isFinite(max) ? max : waveHeight,
    label: waveHeightLabelForValue(spotKeyForTables, waveHeight),
  }
}

type ScoredRawSurfHour = {
  idx: number
  target_time_utc?: string | null
  marine: MarineBundle
  picked: ReturnType<typeof pickBestSwell>
  scored: ReturnType<typeof scoreSurf>
  selected: Sideswell
  waveLabel: string
  tablesTotal: number
  correctedHeight: number
}

function scoreRawSurfHourAtIdx(
  series: MarineSeries,
  spotKeyForTables: string,
  idx: number,
  userExperiences: UserSurfExperienceRecord[],
  customSpotProfile?: CustomSpotScoringProfile | null,
  targetTimeUtc?: string | null
): ScoredRawSurfHour | null {
  const iso = series.mt[clampInt(idx, 0, series.mt.length - 1)]
  if (!iso) return null

  const marine = bundleAtIsoHour(series, iso)
  // Keep forecast slots on the same raw-hour scoring path as frame/mirror via pickBestSwell.
  const picked = pickBestSwell({ spotKey: spotKeyForTables, marine, userExperiences, customSpotProfile })
  const scored = picked.chosenScore
  const selected = selectedSwellFromPick(marine, picked)
  const tablesTotal = scoredTablesTotal(scored)
  const correctedHeight = correctedHeightForPick(selected.height_m, selected.period_s)

  return {
    idx,
    target_time_utc: targetTimeUtc ?? null,
    marine,
    picked,
    scored,
    selected,
    waveLabel: waveHeightLabelForValue(spotKeyForTables, selected.height_m),
    tablesTotal,
    correctedHeight,
  }
}


type SurfScoreRawDebugArgs = {
  label: string
  targetTimeUtc?: string | null
  selectedHourIndex?: number | null
  marine: MarineBundle
  selected: Sideswell
  selectedSwellSource: 'primary' | 'secondary'
  scored: ReturnType<typeof scoreSurf> | null | undefined
  rating?: number | null
  valuesSource?: 'raw_hourly' | 'bucketed' | 'averaged'
  aggregation?: string
}

function surfScoreRawDebug(args: SurfScoreRawDebugArgs) {
  const finalScore = args.rating ?? normalizeSurfRating1to6(args.scored, args.scored?.rating).rating ?? null
  const visual = surfRatingVisual(finalScore)
  return {
    label: args.label,
    timestamp: args.marine.time_utc,
    target_time_utc: args.targetTimeUtc ?? null,
    selected_hour_index: args.selectedHourIndex ?? null,
    values_source: args.valuesSource ?? 'raw_hourly',
    score_path: 'pickBestSwell/scoreSurf shared with frame and mirror raw-hour scoring',
    aggregation: args.aggregation ?? 'raw_hourly_selected_before_display_bucketing',
    raw_wave_height_m: args.marine.primary.height_m,
    raw_wave_direction_deg_from: args.marine.primary.direction_deg_from,
    raw_wave_period_s: args.marine.primary.period_s,
    raw_secondary_swell: args.marine.secondary.present
      ? {
          height_m: args.marine.secondary.height_m,
          direction_deg_from: args.marine.secondary.direction_deg_from,
          period_s: args.marine.secondary.period_s,
        }
      : null,
    raw_wind_speed_ms: args.marine.wind_speed_ms,
    raw_wind_speed_source: OPEN_METEO_NORMAL_WIND_SPEED_FIELD,
    raw_wind_direction_deg_from: args.marine.wind_direction_deg_from,
    raw_wind_direction_source: OPEN_METEO_NORMAL_WIND_DIRECTION_FIELD,
    raw_wind_uses_gusts: false,
    selected_swell_used_for_scoring: {
      source: args.selectedSwellSource,
      height_m: args.selected.height_m,
      direction_deg_from: args.selected.direction_deg_from,
      period_s: args.selected.period_s,
    },
    final_score: finalScore,
    final_label: visual.label,
    final_bars: visual.bars,
    final_color: visual.color,
    table_total: args.scored?.breakdown?.tables?.total ?? null,
    rating_source: args.scored?.breakdown?.experience?.matched ? 'experience_blend' : 'tables',
    scoring_breakdown: args.scored?.breakdown?.scoring_breakdown ?? null,
  }
}

function bestHourFromEvaluatedHours(hours: HourEval[]) {
  let best: HourEval | null = null
  for (const hour of hours) {
    if (!best) {
      best = hour
      continue
    }

    const cmp = betterByScoredThenHeight({
      scoredA: best.scored,
      scoredB: hour.scored,
      correctedHeightA: best.correctedHeight,
      correctedHeightB: hour.correctedHeight,
    })

    if (cmp > 0) best = hour
  }
  return best
}

function bestScoredRawSurfHourAroundTargetIso(args: {
  series: MarineSeries
  spotKeyForTables: string
  isoTargetHour: string
  userExperiences: UserSurfExperienceRecord[]
  customSpotProfile?: CustomSpotScoringProfile | null
  requireSameLocalDay?: { timeZone: string; y: number; m: number; d: number }
}) {
  const targetIdx = nearestHourIndex(args.series.mt, args.isoTargetHour)
  const candidateIndexes = Array.from(new Set([targetIdx - 2, targetIdx - 1, targetIdx, targetIdx + 1].map((i) =>
    clampInt(i, 0, args.series.mt.length - 1)
  )))

  let best: ScoredRawSurfHour | null = null

  for (const idx of candidateIndexes) {
    const iso = args.series.mt[idx]
    if (!iso) continue

    if (args.requireSameLocalDay) {
      const actual = tzPartsYMD(args.requireSameLocalDay.timeZone, new Date(`${iso}:00Z`))
      if (actual.y !== args.requireSameLocalDay.y || actual.m !== args.requireSameLocalDay.m || actual.day !== args.requireSameLocalDay.d) continue
    }

    const cand = scoreRawSurfHourAtIdx(
      args.series,
      args.spotKeyForTables,
      idx,
      args.userExperiences,
      args.customSpotProfile,
      args.isoTargetHour
    )
    if (!cand) continue

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

  return best
}

function buildDayparts(
  series: MarineSeries,
  spotKeyForTables: string,
  userExperiences: UserSurfExperienceRecord[],
  customSpotProfile?: CustomSpotScoringProfile | null
) {
  const now = new Date()
  const nowLocal = tzPartsYMDH(DAYPARTS_TZ, now)

  const dayOffset = Number.isFinite(nowLocal.h) && nowLocal.h >= 21 ? 1 : 0

  const ymdBase = dayOffset
    ? addDaysYMD(nowLocal.y, nowLocal.m, nowLocal.day, dayOffset)
    : { y: nowLocal.y, m: nowLocal.m, d: nowLocal.day }

  return DAYPART_TARGETS.map((dp) => {
    const isoTarget = isoHourUTCFromLocalYMDH(DAYPARTS_TZ, ymdBase.y, ymdBase.m, ymdBase.d, dp.hourLocal)
    const best = bestScoredRawSurfHourAroundTargetIso({
      series,
      spotKeyForTables,
      isoTargetHour: isoTarget,
      userExperiences,
      customSpotProfile,
    })
    if (!best) return null

    const rawDebug = surfScoreRawDebug({
      label: dp.label,
      targetTimeUtc: isoTarget,
      selectedHourIndex: best.idx,
      marine: best.marine,
      selected: best.selected,
      selectedSwellSource: best.picked.chosen,
      scored: best.scored,
      valuesSource: 'raw_hourly',
      aggregation: 'best_raw_hour_around_target_no_input_averaging_before_display_bucketing',
    })

    console.info('[surf-score:daypart-raw-score]', {
      spotKey: spotKeyForTables,
      ...rawDebug,
    })

    return {
      label: dp.label,
      time_utc: best.marine.time_utc,
      rating: best.scored?.rating ?? null,
      wave_height_range_label: best.waveLabel,
      swell_period_s: Number.isFinite(best.selected.period_s) ? Math.round(best.selected.period_s) : null,
      wind_speed_ms: Number.isFinite(best.marine.wind_speed_ms) ? Math.round(best.marine.wind_speed_ms) : null,
      breakdown: best.scored?.breakdown ?? null,
      ratingSource: best.picked.ratingSource,
      finalRating: best.picked.finalRating,
      modelRating: best.picked.modelRating,
      experienceRating: best.picked.experienceRating,
      debug: rawDebug,
    }
  }).filter(Boolean)
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
  scored: ReturnType<typeof scoreSurf>
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
  userExperiences: UserSurfExperienceRecord[],
  customSpotProfile?: CustomSpotScoringProfile | null
): HourEval {
  const iso = series.mt[clampInt(idx, 0, series.mt.length - 1)]
  const marine = bundleAtIsoHour(series, iso)
  const picked = pickBestSwell({ spotKey, marine, userExperiences, customSpotProfile })
  const scored = picked.chosenScore

  const tablesTotal = scoredTablesTotal(scored)

  const chosenH = selectedSwellFromPick(marine, picked).height_m
  const chosenP = selectedSwellFromPick(marine, picked).period_s
  const chosenDir = selectedSwellFromPick(marine, picked).direction_deg_from

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
  userExperiences: UserSurfExperienceRecord[],
  customSpotProfile?: CustomSpotScoringProfile | null
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
      evalHourAtIdx(series, spotKey, i, userExperiences, customSpotProfile)
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
  userExperiences: UserSurfExperienceRecord[],
  customSpotProfile?: CustomSpotScoringProfile | null
) {
  const nowLocal = tzPartsYMD(DAILY_TZ, new Date())
  const out: any[] = []

  const n = clampInt(days, 1, 5)

  for (let di = 0; di < n; di++) {
    const ymd = addDaysYMD(nowLocal.y, nowLocal.m, nowLocal.day, di)
    const wd = weekdayLabelForYMD(DAILY_TZ, ymd.y, ymd.m, ymd.d)

    const best = best4hWindowForLocalDay(series, spotKey, ymd.y, ymd.m, ymd.d, userExperiences, customSpotProfile)

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

    const selectedHour = bestHourFromEvaluatedHours(best.hours)

    if (!selectedHour) {
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

    const selected = selectedSwellFromPick(selectedHour.marine, selectedHour.picked)
    const scored = selectedHour.scored
    const waveLabel = waveHeightLabelForValue(spotKey, selected.height_m)
    const rawDebug = surfScoreRawDebug({
      label: wd,
      targetTimeUtc: null,
      selectedHourIndex: selectedHour.idx,
      marine: selectedHour.marine,
      selected,
      selectedSwellSource: selectedHour.picked.chosen,
      scored,
      valuesSource: 'raw_hourly',
      aggregation: 'best_raw_hour_from_selected_4h_window_no_input_averaging',
    })

    console.info('[surf-score:daily-raw-score]', {
      spotKey,
      date_local: ymdKey(ymd.y, ymd.m, ymd.d),
      ...rawDebug,
    })

    out.push({
      label: wd,
      date_local: ymdKey(ymd.y, ymd.m, ymd.d),
      rating: scored?.rating ?? null,
      wave_height_range_label: waveLabel,
      swell_period_s: Number.isFinite(selected.period_s) ? Math.round(selected.period_s) : null,
      wind_speed_ms: Number.isFinite(selectedHour.marine.wind_speed_ms) ? Math.round(selectedHour.marine.wind_speed_ms) : null,
      time_utc: selectedHour.marine.time_utc,
      debug: rawDebug,
    })
  }

  return out
}


function appForecastDayRange(series: MarineSeries) {
  const keys: string[] = []
  const seen = new Set<string>()

  for (const tIso of series.mt) {
    const dt = new Date(`${tIso}:00Z`)
    if (Number.isNaN(dt.getTime())) continue
    const p = tzPartsYMD(DAILY_TZ, dt)
    const key = ymdKey(p.y, p.m, p.day)
    if (seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }

  const today = tzPartsYMD(DAILY_TZ, new Date())
  const todayKey = ymdKey(today.y, today.m, today.day)
  const start = keys.indexOf(todayKey)
  return (start >= 0 ? keys.slice(start) : keys).map((key) => {
    const [y, m, d] = key.split('-').map((part) => Number(part))
    return { y, m, d, key }
  })
}

function localDateLabelForYMD(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return new Intl.DateTimeFormat('en-GB', { timeZone: DAILY_TZ, day: '2-digit', month: 'short' }).format(dt)
}

function appForecastDaypartBucket(args: {
  series: MarineSeries
  spotKeyForTables: string
  isoTargetHour: string
  userExperiences: UserSurfExperienceRecord[]
  customSpotProfile?: CustomSpotScoringProfile | null
  requireSameLocalDay: { timeZone: string; y: number; m: number; d: number }
}) {
  const idx = exactHourIndex(args.series.mt, args.isoTargetHour)
  if (idx < 0) {
    console.warn('[surf-score:app-forecast-slot:missing-exact-hour]', {
      spotKey: args.spotKeyForTables,
      target_time_utc: args.isoTargetHour,
      available_start_utc: args.series.mt[0] ?? null,
      available_end_utc: args.series.mt[args.series.mt.length - 1] ?? null,
    })
    return null
  }

  const actual = tzPartsYMD(args.requireSameLocalDay.timeZone, new Date(`${args.series.mt[idx]}:00Z`))
  if (actual.y !== args.requireSameLocalDay.y || actual.m !== args.requireSameLocalDay.m || actual.day !== args.requireSameLocalDay.d) {
    console.warn('[surf-score:app-forecast-slot:local-day-mismatch]', {
      spotKey: args.spotKeyForTables,
      target_time_utc: args.isoTargetHour,
      selected_time_utc: args.series.mt[idx],
      expected_day: args.requireSameLocalDay,
      actual_day: actual,
    })
    return null
  }

  const windIdx = exactHourIndex(args.series.wt, args.isoTargetHour)
  if (windIdx < 0 && !args.series.wind_unavailable) {
    console.warn('[surf-score:app-forecast-slot:missing-exact-wind-hour]', {
      spotKey: args.spotKeyForTables,
      target_time_utc: args.isoTargetHour,
      available_wind_start_utc: args.series.wt[0] ?? null,
      available_wind_end_utc: args.series.wt[args.series.wt.length - 1] ?? null,
    })
    return null
  }

  const rawHour = scoreRawSurfHourAtIdx(
    args.series,
    args.spotKeyForTables,
    idx,
    args.userExperiences,
    args.customSpotProfile,
    args.isoTargetHour
  )
  if (!rawHour) return null

  const normalized = normalizeSurfRating1to6(rawHour.scored, rawHour.scored?.rating)
  const rawRating = normalized.rating ?? null
  const conservativeFallbackCapApplied = Boolean(rawHour.marine.fallback_fields.some((field) => field === OPEN_METEO_NORMAL_WIND_SPEED_FIELD || field === OPEN_METEO_NORMAL_WIND_DIRECTION_FIELD))
  const rating = rawRating == null ? null : conservativeFallbackCapApplied ? Math.min(rawRating, 2) : rawRating
  const visual = surfRatingVisual(rating)
  const tables = rawHour.scored?.breakdown?.tables
  const waveHeightRange = waveHeightBucketMinMaxForValue(args.spotKeyForTables, rawHour.selected.height_m)

  return {
    rawHour,
    rating,
    uncappedRating: rawRating,
    conservativeFallbackCapApplied,
    ratingFromExperience: normalized.ratingFromExperience,
    experienceDiceValue: normalized.experienceDiceValue == null ? undefined : conservativeFallbackCapApplied ? Math.min(normalized.experienceDiceValue, 2) : normalized.experienceDiceValue,
    wave_height_range_label: rawHour.waveLabel,
    displayed_wave_height_min_m: waveHeightRange.min,
    displayed_wave_height_max_m: waveHeightRange.max,
    swell_height_m: Number.isFinite(rawHour.selected.height_m) ? rawHour.selected.height_m : null,
    swell_period_s: Number.isFinite(rawHour.selected.period_s) ? Math.round(rawHour.selected.period_s) : null,
    swell_direction_deg: Number.isFinite(rawHour.selected.direction_deg_from) ? rawHour.selected.direction_deg_from : null,
    wind_speed_ms: Number.isFinite(rawHour.marine.wind_speed_ms) ? Math.round(rawHour.marine.wind_speed_ms) : null,
    wind_direction_deg: Number.isFinite(rawHour.marine.wind_direction_deg_from) ? rawHour.marine.wind_direction_deg_from : null,
    ratingSource: normalized.ratingFromExperience ? 'experience_blend' : rawHour.picked.ratingSource,
    finalRating: conservativeFallbackCapApplied ? rating : rawHour.picked.finalRating,
    modelRating: conservativeFallbackCapApplied ? rating : rawHour.picked.modelRating,
    experienceRating: normalized.ratingFromExperience ? rating : rawHour.picked.experienceRating,
    visual,
    debugScores: {
      height_score: tables?.wave_height?.score ?? null,
      height_raw_bucket_score: tables?.wave_height?.rawBucketScore ?? null,
      height_smoothed_score: tables?.wave_height?.smoothedScore ?? null,
      period_score: tables?.wave_period?.score ?? null,
      period_raw_bucket_score: tables?.wave_period?.rawBucketScore ?? null,
      period_smoothed_score: tables?.wave_period?.smoothedScore ?? null,
      wave_direction_score: tables?.wave_dir?.score ?? null,
      wave_direction_raw_bucket_score: tables?.wave_dir?.rawBucketScore ?? null,
      wave_direction_smoothed_score: tables?.wave_dir?.smoothedScore ?? null,
      wind_direction_score: tables?.wind_dir?.score ?? null,
      wind_direction_raw_bucket_score: tables?.wind_dir?.rawBucketScore ?? null,
      wind_direction_smoothed_score: tables?.wind_dir?.smoothedScore ?? null,
      raw_wind_direction_score: tables?.wind_dir?.raw_wind_direction_score ?? null,
      effective_wind_direction_score: tables?.wind_dir?.effective_wind_direction_score ?? null,
      wind_direction_weight_multiplier: tables?.wind_dir?.wind_direction_weight_multiplier ?? null,
      wind_speed_ms_for_direction_weighting: tables?.wind_dir?.wind_speed_ms ?? null,
      calm_wind_weighting_applied: tables?.wind_dir?.calm_wind_weighting_applied ?? false,
      wind_strength_score: tables?.wind_speed?.score ?? null,
      wind_strength_raw_bucket_score: tables?.wind_speed?.rawBucketScore ?? null,
      wind_strength_smoothed_score: tables?.wind_speed?.smoothedScore ?? null,
      final_score: rating,
      uncapped_final_score: rawRating,
      conservative_fallback_cap_applied: conservativeFallbackCapApplied,
      table_total: tables?.total ?? null,
      final_label: visual.label,
      final_bars: visual.bars,
      final_color: visual.color,
      scoring_breakdown: rawHour.scored?.breakdown?.scoring_breakdown ?? null,
    },
  }
}

function buildAppSurfForecast(
  series: MarineSeries,
  spotKeyForTables: string,
  userExperiences: UserSurfExperienceRecord[],
  customSpotProfile?: CustomSpotScoringProfile | null,
  fuelDebug?: Record<string, unknown>
) {
  return appForecastDayRange(series)
    .map((ymd) => {
      const buckets = APP_FORECAST_TARGETS.map((target) => {
        const isoTarget = isoHourUTCFromLocalYMDH(DAILY_TZ, ymd.y, ymd.m, ymd.d, target.hourLocal)
        const selected = appForecastDaypartBucket({
          series,
          spotKeyForTables,
          isoTargetHour: isoTarget,
          userExperiences,
          customSpotProfile,
          requireSameLocalDay: { timeZone: DAILY_TZ, y: ymd.y, m: ymd.m, d: ymd.d },
        })
        if (!selected) return null

        const rawDebug = surfScoreRawDebug({
          label: target.label,
          targetTimeUtc: isoTarget,
          selectedHourIndex: selected.rawHour.idx,
          marine: selected.rawHour.marine,
          selected: selected.rawHour.selected,
          selectedSwellSource: selected.rawHour.picked.chosen,
          scored: selected.rawHour.scored,
          rating: selected.rating,
          valuesSource: 'raw_hourly',
          aggregation: 'exact_raw_hour_no_input_averaging_before_display_bucketing',
        })

        const debug = {
          day: ymd.key,
          slot: target.label.toLowerCase(),
          selected_time_utc: selected.rawHour.marine.time_utc,
          displayed_wave_height_min_m: selected.displayed_wave_height_min_m,
          displayed_wave_height_max_m: selected.displayed_wave_height_max_m,
          displayed_wave_height_range_label: selected.wave_height_range_label,
          display_grouping: { aggregation: 'exact_visible_slot_values' },
          selected_swell_height: selected.rawHour.selected.height_m,
          scored_wave_height: selected.rawHour.selected.height_m,
          displayed_wave_direction: selected.rawHour.selected.direction_deg_from,
          scored_wave_direction: selected.rawHour.selected.direction_deg_from,
          selected_swell_direction: selected.rawHour.selected.direction_deg_from,
          displayed_period: selected.swell_period_s,
          scored_period: selected.rawHour.selected.period_s,
          selected_period: selected.rawHour.selected.period_s,
          displayed_wind_speed: selected.wind_speed_ms,
          scored_wind_speed: selected.rawHour.marine.wind_speed_ms,
          wind_speed: selected.rawHour.marine.wind_speed_ms,
          displayed_wind_direction: selected.wind_direction_deg,
          scored_wind_direction: selected.rawHour.marine.wind_direction_deg_from,
          wind_direction: selected.rawHour.marine.wind_direction_deg_from,
          fallback_used: selected.rawHour.marine.fallback_used,
          fallback_fields: selected.rawHour.marine.fallback_fields,
          ...rawDebug,
          ...selected.debugScores,
          rating_from_experience: selected.ratingFromExperience,
          rating_source: selected.ratingSource,
          selected_swell_source: selected.rawHour.picked.chosen,
          selected_swell_index: selected.rawHour.picked.selectedSwellIndex,
          why_selected: selected.rawHour.picked.whySelected,
          primary_swell: selected.rawHour.marine.primary,
          secondary_swell: selected.rawHour.marine.secondary,
          swell_selection: selected.rawHour.picked.selectionDebug,
          fuel_penalty: fuelDebug ?? null,
        }

        console.info('[surf-score:app-forecast-slot]', {
          spotKey: spotKeyForTables,
          date_local: ymd.key,
          ...debug,
        })

        return {
          label: target.label,
          target_time_utc: isoTarget,
          time_utc: selected.rawHour.marine.time_utc,
          selected_hour_index: selected.rawHour.idx,
          rating: selected.rating,
          ratingFromExperience: selected.ratingFromExperience || undefined,
          experienceDiceValue: selected.experienceDiceValue,
          wave_height_range_label: selected.wave_height_range_label,
          displayed_wave_height_min_m: selected.displayed_wave_height_min_m,
          displayed_wave_height_max_m: selected.displayed_wave_height_max_m,
          swell_height_m: selected.swell_height_m,
          swell_period_s: selected.swell_period_s,
          swell_direction_deg: selected.swell_direction_deg,
          wind_speed_ms: selected.wind_speed_ms,
          wind_direction_deg: selected.wind_direction_deg,
          breakdown: selected.rawHour.scored?.breakdown ?? null,
          ratingSource: selected.ratingSource,
          finalRating: selected.finalRating,
          modelRating: selected.modelRating,
          experienceRating: selected.experienceRating,
          debug,
        }
      }).filter(Boolean)

      return {
        label: weekdayLabelForYMD(DAILY_TZ, ymd.y, ymd.m, ymd.d),
        date_local: ymd.key,
        date_label: localDateLabelForYMD(ymd.y, ymd.m, ymd.d),
        buckets,
      }
    })
    .filter((day) => day.buckets.length > 0)
}


function compactExperienceBreakdown(scored: any) {
  const exp = scored?.breakdown?.experience
  if (!exp || typeof exp !== 'object') return { matched: false }
  return {
    matched: !!exp.matched,
    rating_1_6: exp.rating_1_6 ?? null,
    model_rating_1_6: exp.model_rating_1_6 ?? null,
    blended_rating_1_6: exp.blended_rating_1_6 ?? null,
    blended_rating_float: exp.blended_rating_float ?? null,
    confidence: exp.confidence ?? null,
    match_type: exp.match_type ?? null,
    source: exp.source ?? null,
  }
}

function compactScoredPart(part: any) {
  const normalized = normalizeSurfRating1to6(part)
  return {
    ...part,
    rating: normalized.rating ?? null,
    ratingFromExperience: normalized.ratingFromExperience || undefined,
    experienceDiceValue: normalized.experienceDiceValue,
    breakdown: {
      experience: compactExperienceBreakdown(part),
    },
  }
}

function compactSurfPayload(payload: any) {
  const normalized = normalizeSurfRating1to6(payload)
  const compact: any = {
    spot: payload?.spot ?? null,
    spotId: payload?.spotId ?? null,
    spotIdResolved: payload?.spotIdResolved ?? payload?.spotId ?? null,
    rating: normalized.rating ?? null,
    score: normalized.rating ?? null,
    line1: payload?.line1 ?? null,
    line2: payload?.line2 ?? null,
    ratingFromExperience: normalized.ratingFromExperience || undefined,
    experienceDiceValue: normalized.experienceDiceValue,
    breakdown: {
      experience: compactExperienceBreakdown(payload),
    },
    inputs: payload?.inputs ?? {},
    forecast: payload?.forecast ?? {},
    ui: payload?.ui ?? {},
    sun: payload?.sun ?? {},
    air: payload?.air ?? {},
    water: payload?.water ?? {},
    weather: payload?.weather ?? {},
    temp_c: payload?.temp_c ?? null,
    weather_label: payload?.weather_label ?? null,
    time_utc: payload?.time_utc ?? null,
  }

  if (Array.isArray(payload?.dayparts)) {
    compact.dayparts = payload.dayparts.map(compactScoredPart)
  }
  if (Array.isArray(payload?.daily)) {
    compact.daily = payload.daily.map(compactScoredPart)
  }

  return compact
}

function surfJsonResponse(payload: any, compact: boolean, init?: { status?: number }) {
  return jsonNoStore(compact ? compactSurfPayload(payload) : payload, init)
}

export async function GET(req: Request) {
  try {
    
    console.log('RAW AUTH HEADER:', req.headers.get('authorization'))
    const url = new URL(req.url)
    const requestContext = createSurfRequestContext({
      configUpdatedAt: url.searchParams.get('configUpdatedAt'),
      forceRefresh: truthy1(url.searchParams.get('forceRefresh')) || truthy1(url.searchParams.get('refresh')),
    })
    console.log('SURF SCORE QUERY:', Object.fromEntries(url.searchParams.entries()))

    const spotIdRaw = (url.searchParams.get('spotId') || '').trim()
    const spotIdQ = spotIdRaw.startsWith('custom:') ? spotIdRaw.slice('custom:'.length).trim() : spotIdRaw
    const spotQ = (url.searchParams.get('spot') || '').trim()

    const latQ = asNum(url.searchParams.get('lat'))
    const lonQ = asNum(url.searchParams.get('lon'))

    const hoursQ = asInt(url.searchParams.get('hours'))
    const hours = clampInt(hoursQ ?? 4, 1, 12)

    const daypartsOn = truthy1(url.searchParams.get('dayparts'))

    const dailyOn = truthy1(url.searchParams.get('daily'))
    const appForecastOn = truthy1(url.searchParams.get('appForecast'))
    const daysQ = asInt(url.searchParams.get('days'))
    const days = clampInt(daysQ ?? 5, 1, 5)

    const fuelOn =
      (url.searchParams.get('fuelPenalty') || '').trim() === '1' ||
      (url.searchParams.get('fuelPenalty') || '').trim().toLowerCase() === 'true'

    const homeLatQ = asNum(url.searchParams.get('homeLat'))
    const homeLonQ = asNum(url.searchParams.get('homeLon'))
    const home: LatLon | null = fuelOn && homeLatQ != null && homeLonQ != null ? { lat: homeLatQ, lon: homeLonQ } : null

    const bestOn = bestModeEnabled(url, hours)
    const compactOn = truthy1(url.searchParams.get('compact')) || truthy1(url.searchParams.get('frame'))

    const hasBearer = !!authBearerFromReq(req)
    const customSpotsForUser = hasBearer ? await fetchCustomSpotsForUser(req) : []

    const userExpBySpotId = await fetchUserExperiencesBySpotIds(
      req,
      Array.from(
        new Set(
          Object.values(SURF_SPOTS)
            .map((s) => String(s?.spotId ?? '').trim())
            .concat(customSpotsForUser.map((s) => String(s?.id ?? '').trim()))
            .concat(spotIdQ ? [spotIdQ] : [])
            .filter(Boolean)
        )
      )
    )

    // ---------- Today's Best ----------
    if (isTodaysBest(spotIdQ, spotQ)) {
      const EXCLUDE_FROM_TODAYS_BEST = new Set<string>([
        TODAYS_BEST_ID,
        'vigdel',
      ])

      const mapCandidates = Object.values(SURF_SPOTS).filter((s) => {
        if (!s || !s.spotId) return false
        if (EXCLUDE_FROM_TODAYS_BEST.has(s.spotId)) return false
        if (s.label.toLowerCase() === TODAYS_BEST_LABEL.toLowerCase()) return false
        return true
      })

      const customCandidates = customSpotsForUser.map((row) => ({
        spotId: row.id,
        label: row.name,
        lat: row.lat,
        lon: row.lon,
        customSpotProfile: customSpotProfileFromRow(row),
      }))

      const candidates = mapCandidates.concat(customCandidates)

      if (!candidates.length) {
        return jsonNoStore({ error: 'No spots available for Today’s Best' }, { status: 500 })
      }

      const CONCURRENCY = 4

      const settled = await mapWithConcurrency(candidates, CONCURRENCY, async (s) => {
        try {
          const series = await fetchMarineSeries(s.lat, s.lon, requestContext)
          const userExperiences = userExperiencesForSpot(userExpBySpotId, s.spotId)
          const candidateCustomProfile = ((s as any).customSpotProfile ?? null) as CustomSpotScoringProfile | null
          const candidateSpotKey = spotKeyForResolvedForecast(s.label, series, candidateCustomProfile)
          const candidateScoringProfile = scoringProfileForResolvedForecast(series, candidateCustomProfile)

          const best = bestWithinWindow(series, candidateSpotKey, hours, userExperiences, candidateScoringProfile)
          const tablesTotal = Number(best?.tablesTotal ?? -Infinity)

          return {
            ok: true as const,
            spotId: s.spotId,
            spotLabel: s.label,
            scoringSpotKey: candidateSpotKey,
            lat: s.lat,
            lon: s.lon,
            series,
            best,
            drive_minutes: null as number | null,
            fuel_penalty_points: 0,
            effective_tables_total: tablesTotal,
            customSpotProfile: candidateScoringProfile,
          }
        } catch {
          return { ok: false as const }
        }
      })

      const results = settled.filter((x: any) => x && x.ok) as Array<{
        spotId: string
        spotLabel: string
        scoringSpotKey: string
        lat: number
        lon: number
        series: MarineSeries
        best: BestPick
        drive_minutes: number | null
        fuel_penalty_points: number
        effective_tables_total: number
        customSpotProfile?: CustomSpotScoringProfile | null
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
        fetchSunTimes(chosen.lat, chosen.lon, requestContext),
        fetchDailyExtras(chosen.lat, chosen.lon, requestContext).catch(() => null as any),
        fetchWaterTempMinMaxToday(chosen.lat, chosen.lon, requestContext).catch(() => ({ temp_min_c: null, temp_max_c: null })),
      ])

      const extras = dailyExtras as (DailyExtrasResult | null)
      const air = extras?.air ?? { temp_min_c: null, temp_max_c: null }
      const weather = extras?.weather ?? { code: null, main: 'Cloudy' }
      const temp_c = extras?.temp_c ?? null
      const weather_label = extras?.weather_label ?? weather.main
      const weather_source = chosen.series.weather_source
      const weather_error = chosen.series.weather_error ?? extras?.error ?? null
      const weather_cache_age_ms = chosen.series.weather_cache_age_ms
      const weather_stale_expires_at = chosen.series.weather_stale_expires_at
      const daily_weather_source = extras?.source ?? 'unavailable'
      const daily_weather_error = extras?.error ?? null
      const daily_weather_cache_age_ms = extras?.cache_age_ms ?? null
      const daily_weather_stale_expires_at = extras?.stale_expires_at ?? null

      const chosenHeights: number[] = []
      for (let off = 0; off < hours; off++) {
        const b = makeBundleAt(chosen.series, off)
        const p = pickBestSwell({ spotKey: chosen.scoringSpotKey, marine: b, userExperiences: chosenUserExperiences, customSpotProfile: chosen.customSpotProfile ?? null })
        const h = selectedSwellFromPick(b, p).height_m
        if (Number.isFinite(h)) chosenHeights.push(h)
      }

      let minH = 0
      let maxH = 0
      if (chosenHeights.length) {
        minH = Math.min(...chosenHeights)
        maxH = Math.max(...chosenHeights)
      }

      const st = getSpotTables(chosen.scoringSpotKey)
      const selectedSwellNow = selectedSwellFromPick(marineNow, pickedNow)
      const waveHeightNow = selectedSwellNow.height_m

      surfDebugConditionLog({
        spotId: chosen.spotId,
        spotName: chosen.spotLabel,
        lat: chosen.lat,
        lon: chosen.lon,
        series: chosen.series,
        condition: { hourOffset: chosen.best.hourOffset, marine: marineNow, picked: pickedNow, scored: scoredNow },
        finalRating: pickedNow.finalRating ?? scoredNow.rating ?? null,
        spotKey: chosen.scoringSpotKey,
        cardMode: 'best_next_4h',
      })

      const waveBucketRaw = waveHeightBucketRawForValue(chosen.scoringSpotKey, waveHeightNow)
      const periodBucketRaw = bucketLabelFromRangeTable(
        st?.wave_period ?? [],
        selectedSwellNow.period_s
      )
      const windBucketRaw = bucketLabelFromRangeTable(st?.wind_speed ?? [], marineNow.wind_speed_ms)

      const bucketLabelForFrame = formatBucketLabelForUi(waveBucketRaw) ?? fmtRange(minH, maxH)

      const dayparts = daypartsOn
        ? buildDayparts(chosen.series, chosen.scoringSpotKey, chosenUserExperiences, chosen.customSpotProfile ?? null)
        : undefined

      const daily = dailyOn
        ? buildDailyFrom4hWindows(chosen.series, chosen.scoringSpotKey, days, chosenUserExperiences, chosen.customSpotProfile ?? null)
        : undefined

      const appForecast = appForecastOn
        ? buildAppSurfForecast(chosen.series, chosen.scoringSpotKey, chosenUserExperiences, chosen.customSpotProfile ?? null, {
            enabled: fuelOn,
            applies_to: 'todays_best_spot_selection',
            drive_minutes: chosen.drive_minutes,
            fuel_penalty_points: chosen.fuel_penalty_points,
            effective_tables_total: chosen.effective_tables_total,
            home_provided: !!home,
          })
        : undefined

      return surfJsonResponse({
        spot: chosen.spotLabel,
        spotId: chosen.spotId,
        geo: { lat: chosen.lat, lon: chosen.lon, source: 'todays_best', query: null, forecast: chosen.series.forecastPoint, coordinate_resolution: chosen.series.coordinateResolution },
        time_utc: marineNow.time_utc,

        sun: { sunrise: sun.sunrise, sunset: sun.sunset },
        air,
        water,
        weather,

        temp_c,
        weather_label,

        picked: {
          which: pickedNow.chosen,
          ...pickedNow.selectionDebug,
          swell_selection: pickedNow.selectionDebug,
          selectedSwellIndex: pickedNow.selectedSwellIndex,
          selectedMainSwellIndex: pickedNow.selectedMainSwellIndex,
          contributingSwellIndexes: pickedNow.contributingSwellIndexes,
          swellMixSignature: pickedNow.swellMixSignature,
          experienceMatchType: pickedNow.experienceMatchType,
          experienceConfidence: pickedNow.experienceConfidence,
          modelRating: pickedNow.modelRating,
          experienceRating: pickedNow.experienceRating,
          finalRating: pickedNow.finalRating,
          selectedSwellHeight: pickedNow.selectedSwellHeight,
          selectedSwellPeriod: pickedNow.selectedSwellPeriod,
          selectedSwellDirection: pickedNow.selectedSwellDirection,
          ratingSource: pickedNow.ratingSource,
          displayHeightSource: pickedNow.displayHeightSource,
          whySelected: pickedNow.whySelected,
        },

        inputs: {
          time_utc: marineNow.time_utc,
          swell_height_m: waveHeightNow,
          swell_direction_deg: selectedSwellNow.direction_deg_from,
          swell_period_s: selectedSwellNow.period_s,
          wind_speed_ms: marineNow.wind_speed_ms,
          wind_direction_deg: marineNow.wind_direction_deg_from,
          wind_source: chosen.series.weather_source,
          wind_error: chosen.series.weather_error,
          wind_cache_age_ms: chosen.series.weather_cache_age_ms,
          wind_stale_expires_at: chosen.series.weather_stale_expires_at,
          wind_unavailable: chosen.series.wind_unavailable,
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
        ...(appForecastOn ? { appForecast } : {}),

        debug: {
          weather_source,
          weather_error,
          weather_cache_age_ms,
          weather_stale_expires_at,
          marine_source: chosen.series.marine_source,
          marine_error: chosen.series.marine_error,
          marine_cache_age_ms: chosen.series.marine_cache_age_ms,
          marine_stale_expires_at: chosen.series.marine_stale_expires_at,
          marine_cache: chosen.series.marine_cache_debug,
          weather_cache: chosen.series.weather_cache_debug,
          wind_unavailable: chosen.series.wind_unavailable,
          daily_weather_source,
          daily_weather_error,
          daily_weather_cache_age_ms,
          daily_weather_stale_expires_at,
          auth: {
            has_bearer: hasBearer,
            chosen_user_experiences_for_spot: chosenUserExperiences.length,
            chosen_user_experience_ids: chosenUserExperiences.map((x) => x.id),
            chosen_user_experience_logged_at: chosenUserExperiences.map((x) => x.logged_at),
          },

          ...pickedNow.selectionDebug,
          swell_selection: pickedNow.selectionDebug,
          selectedSwellIndex: pickedNow.selectedSwellIndex,
          selectedMainSwellIndex: pickedNow.selectedMainSwellIndex,
          contributingSwellIndexes: pickedNow.contributingSwellIndexes,
          swellMixSignature: pickedNow.swellMixSignature,
          experienceMatchType: pickedNow.experienceMatchType,
          experienceConfidence: pickedNow.experienceConfidence,
          modelRating: pickedNow.modelRating,
          experienceRating: pickedNow.experienceRating,
          finalRating: pickedNow.finalRating,
          selectedSwellHeight: pickedNow.selectedSwellHeight,
          selectedSwellPeriod: pickedNow.selectedSwellPeriod,
          selectedSwellDirection: pickedNow.selectedSwellDirection,
          ratingSource: pickedNow.ratingSource,
          displayHeightSource: pickedNow.displayHeightSource,
          whySelected: pickedNow.whySelected,
          primary_swell_metrics: pickedNow.primaryMetrics,
          secondary_swell_metrics: pickedNow.secondaryMetrics,

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
      }, compactOn)
    }

    // ---------- Normal existing logic ----------

    let spotId: string | null = null
    let spotLabel: string | null = null
    let lat: number | null = null
    let lon: number | null = null
    let geoSource: string = 'unknown'
    const geoQuery: string | null = null

    let customSpotProfile: CustomSpotScoringProfile | null = null
    if (spotIdQ) {
      const s = SURF_SPOTS[spotIdQ]
      if (s) {
        spotId = s.spotId
        spotLabel = s.label
        lat = s.lat
        lon = s.lon
        geoSource = latQ != null || lonQ != null ? 'spotId_map_ignored_query_latlon' : 'spotId_map'

        if (latQ === 0 && lonQ === 0 && (s.lat !== 0 || s.lon !== 0)) {
          console.warn('[surf-score:coordinates]', {
            message: 'Ignoring lat=0/lon=0 for known built-in surf spot',
            spot_id: s.spotId,
            spot_name: s.label,
            request_lat: latQ,
            request_lon: lonQ,
            resolved_lat: s.lat,
            resolved_lon: s.lon,
          })
        }
      } else {
        const cs = await fetchCustomSpotById(req, spotIdQ)
        if (!cs) return jsonNoStore({ error: 'Unknown spotId', spotId: spotIdQ }, { status: 400 })
        spotId = String(cs.id)
        spotLabel = String(cs.name)
        lat = Number(cs.lat)
        lon = Number(cs.lon)
        geoSource = latQ != null || lonQ != null ? 'spotId_custom_ignored_query_latlon' : 'spotId_custom'

        if ((latQ != null && latQ !== lat) || (lonQ != null && lonQ !== lon)) {
          console.warn('[surf-score:coordinates]', {
            message: 'Ignoring query lat/lon for custom surf spot; using stored custom spot coordinates',
            spot_id: spotId,
            spot_name: spotLabel,
            request_lat: latQ,
            request_lon: lonQ,
            resolved_lat: lat,
            resolved_lon: lon,
          })
        }

        customSpotProfile = customSpotProfileFromRow(cs)
      }
    } else if (latQ != null && lonQ != null) {
      lat = latQ
      lon = lonQ
      geoSource = 'query_latlon'
      spotId = null
      spotLabel = spotQ || null
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

    const series = await fetchMarineSeries(lat, lon, requestContext)
    const spotUserExperiences = userExperiencesForSpot(userExpBySpotId, spotId)

    const [sun, dailyExtras, water] = await Promise.all([
      fetchSunTimes(lat, lon, requestContext),
      fetchDailyExtras(lat, lon, requestContext).catch(() => null as any),
      fetchWaterTempMinMaxToday(lat, lon, requestContext).catch(() => ({ temp_min_c: null, temp_max_c: null })),
    ])

    const extras = dailyExtras as (DailyExtrasResult | null)
    const air = extras?.air ?? { temp_min_c: null, temp_max_c: null }
    const weather = extras?.weather ?? { code: null, main: 'Cloudy' }
    const temp_c = extras?.temp_c ?? null
    const weather_label = extras?.weather_label ?? weather.main
    const weather_source = series.weather_source
    const weather_error = series.weather_error ?? extras?.error ?? null
    const weather_cache_age_ms = series.weather_cache_age_ms
    const weather_stale_expires_at = series.weather_stale_expires_at
    const daily_weather_source = extras?.source ?? 'unavailable'
    const daily_weather_error = extras?.error ?? null
    const daily_weather_cache_age_ms = extras?.cache_age_ms ?? null
    const daily_weather_stale_expires_at = extras?.stale_expires_at ?? null

    const initialSpotKeyForTables = spotLabel ?? spotQ ?? spotId ?? 'Unknown'
    const spotKeyForTables = spotKeyForResolvedForecast(initialSpotKeyForTables, series, customSpotProfile)
    const scoringCustomSpotProfile = scoringProfileForResolvedForecast(series, customSpotProfile)

    const currentCondition = currentNormalizedCondition(series, spotKeyForTables, spotUserExperiences, scoringCustomSpotProfile)
    const selectedCondition = bestOn
      ? bestNormalizedCondition(series, spotKeyForTables, hours, spotUserExperiences, scoringCustomSpotProfile)
      : currentCondition

    const marineNow = selectedCondition.marine
    const pickedNow = selectedCondition.picked
    const scoredNow = selectedCondition.scored
    const chosenHourOffset = selectedCondition.hourOffset
    const displayPickedNow = bestOn
      ? pickedNow
      : pickBestSwell({ spotKey: spotKeyForTables, marine: marineNow, userExperiences: spotUserExperiences, customSpotProfile: null })

    const chosenHeights: number[] = []
    for (let off = 0; off < hours; off++) {
      const b = makeBundleAt(series, off)
      const p = pickBestSwell({
        spotKey: spotKeyForTables,
        marine: b,
        userExperiences: spotUserExperiences,
        customSpotProfile: bestOn ? scoringCustomSpotProfile : null,
      })
      const h = selectedSwellFromPick(b, p).height_m
      if (Number.isFinite(h)) chosenHeights.push(h)
    }

    let minH = 0
    let maxH = 0
    if (chosenHeights.length) {
      minH = Math.min(...chosenHeights)
      maxH = Math.max(...chosenHeights)
    }

    const st = getSpotTables(spotKeyForTables)
    const selectedSwellNow = selectedSwellFromPick(marineNow, displayPickedNow)
    const waveHeightNow = selectedSwellNow.height_m

    const waveBucketRaw = waveHeightBucketRawForValue(spotKeyForTables, waveHeightNow)
    const periodBucketRaw = bucketLabelFromRangeTable(
      st?.wave_period ?? [],
      selectedSwellNow.period_s
    )
    const windBucketRaw = bucketLabelFromRangeTable(st?.wind_speed ?? [], marineNow.wind_speed_ms)

    const bucketLabelForFrame = formatBucketLabelForUi(waveBucketRaw) ?? fmtRange(minH, maxH)
    const displayedLine1 = `${waveHeightNow.toFixed(1)}m @ ${Math.round(selectedSwellNow.period_s)}s`
    const displayedLine2 = `${degToCompass8(selectedSwellNow.direction_deg_from)} swell, ${degToCompass8(marineNow.wind_direction_deg_from)} wind`

    surfDebugConditionLog({
      spotId,
      spotName: spotLabel ?? spotQ ?? spotId,
      lat,
      lon,
      series,
      condition: selectedCondition,
      finalRating: pickedNow.finalRating ?? scoredNow.rating ?? null,
      spotKey: spotKeyForTables,
      cardMode: bestOn ? 'best_next_4h' : 'current',
      displayedSwell: selectedSwellNow,
      displayedWindSpeedMs: marineNow.wind_speed_ms,
      displayedWindDirectionDegFrom: marineNow.wind_direction_deg_from,
      displayedWaveLabel: bucketLabelForFrame,
      displayedPeriodS: Number.isFinite(selectedSwellNow.period_s) ? Math.round(selectedSwellNow.period_s) : null,
      displayedWindSpeedRoundedMs: Number.isFinite(marineNow.wind_speed_ms) ? Math.round(marineNow.wind_speed_ms) : null,
    })

    const dayparts = daypartsOn ? buildDayparts(series, spotKeyForTables, spotUserExperiences, scoringCustomSpotProfile) : undefined
    const daily = dailyOn ? buildDailyFrom4hWindows(series, spotKeyForTables, days, spotUserExperiences, scoringCustomSpotProfile) : undefined
    const appForecast = appForecastOn
      ? buildAppSurfForecast(series, spotKeyForTables, spotUserExperiences, scoringCustomSpotProfile, {
          enabled: fuelOn,
          applies_to: 'todays_best_only',
          home_provided: !!home,
          fuel_penalty_points: 0,
        })
      : undefined

    return surfJsonResponse({
      spot: spotLabel ?? spotQ ?? spotId,
      spotId,
      geo: { lat, lon, source: geoSource, query: geoQuery, forecast: series.forecastPoint, coordinate_resolution: series.coordinateResolution },
      time_utc: marineNow.time_utc,

      sun: { sunrise: sun.sunrise, sunset: sun.sunset },
      air,
      water,
      weather,

      temp_c,
      weather_label,

      picked: {
        which: pickedNow.chosen,
        ...pickedNow.selectionDebug,
        swell_selection: pickedNow.selectionDebug,
        selectedSwellIndex: pickedNow.selectedSwellIndex,
        selectedMainSwellIndex: pickedNow.selectedMainSwellIndex,
        contributingSwellIndexes: pickedNow.contributingSwellIndexes,
        swellMixSignature: pickedNow.swellMixSignature,
        experienceMatchType: pickedNow.experienceMatchType,
        experienceConfidence: pickedNow.experienceConfidence,
        modelRating: pickedNow.modelRating,
        experienceRating: pickedNow.experienceRating,
        finalRating: pickedNow.finalRating,
        selectedSwellHeight: pickedNow.selectedSwellHeight,
        selectedSwellPeriod: pickedNow.selectedSwellPeriod,
        selectedSwellDirection: pickedNow.selectedSwellDirection,
        ratingSource: pickedNow.ratingSource,
        displayHeightSource: pickedNow.displayHeightSource,
        whySelected: pickedNow.whySelected,
        displayedSelectedSwellHeight: selectedSwellNow.height_m,
        displayedSelectedSwellPeriod: selectedSwellNow.period_s,
        displayedSelectedSwellDirection: selectedSwellNow.direction_deg_from,
      },

      inputs: {
        time_utc: marineNow.time_utc,
        swell_height_m: waveHeightNow,
        swell_direction_deg: selectedSwellNow.direction_deg_from,
        swell_period_s: selectedSwellNow.period_s,
        wind_speed_ms: marineNow.wind_speed_ms,
        wind_direction_deg: marineNow.wind_direction_deg_from,
        wind_source: series.weather_source,
        wind_error: series.weather_error,
        wind_cache_age_ms: series.weather_cache_age_ms,
        wind_stale_expires_at: series.weather_stale_expires_at,
        wind_unavailable: series.wind_unavailable,
        primary_swell: marineNow.primary,
        secondary_swell: marineNow.secondary,
      },

      rating: scoredNow.rating,
      score: scoredNow.score,
      line1: displayedLine1,
      line2: displayedLine2,
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
      ...(appForecastOn ? { appForecast } : {}),

      debug: {
        weather_source,
        weather_error,
        weather_cache_age_ms,
        weather_stale_expires_at,
        marine_source: series.marine_source,
        marine_error: series.marine_error,
        marine_cache_age_ms: series.marine_cache_age_ms,
        marine_stale_expires_at: series.marine_stale_expires_at,
        marine_cache: series.marine_cache_debug,
        weather_cache: series.weather_cache_debug,
        wind_unavailable: series.wind_unavailable,
        daily_weather_source,
        daily_weather_error,
        daily_weather_cache_age_ms,
        daily_weather_stale_expires_at,
        auth: {
          has_bearer: hasBearer,
          user_experiences_for_spot: spotUserExperiences.length,
          user_experience_ids: spotUserExperiences.map((x) => x.id),
          user_experience_logged_at: spotUserExperiences.map((x) => x.logged_at),
        },

        ...pickedNow.selectionDebug,
        swell_selection: pickedNow.selectionDebug,
        selectedSwellIndex: pickedNow.selectedSwellIndex,
        selectedMainSwellIndex: pickedNow.selectedMainSwellIndex,
        contributingSwellIndexes: pickedNow.contributingSwellIndexes,
        swellMixSignature: pickedNow.swellMixSignature,
        experienceMatchType: pickedNow.experienceMatchType,
        experienceConfidence: pickedNow.experienceConfidence,
        modelRating: pickedNow.modelRating,
        experienceRating: pickedNow.experienceRating,
        finalRating: pickedNow.finalRating,
        selectedSwellHeight: pickedNow.selectedSwellHeight,
        selectedSwellPeriod: pickedNow.selectedSwellPeriod,
        selectedSwellDirection: pickedNow.selectedSwellDirection,
        ratingSource: pickedNow.ratingSource,
        displayHeightSource: pickedNow.displayHeightSource,
        whySelected: pickedNow.whySelected,
        displayedSelectedSwellHeight: selectedSwellNow.height_m,
        displayedSelectedSwellPeriod: selectedSwellNow.period_s,
        displayedSelectedSwellDirection: selectedSwellNow.direction_deg_from,
        primary_swell_metrics: pickedNow.primaryMetrics,
        secondary_swell_metrics: pickedNow.secondaryMetrics,

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
          note: bestOn ? 'Main rating/lines/time use the same normalized condition object as NOW, selected by bestWithinWindow' : 'Main rating/lines/time are NOW (hourOffset=0)',
          current_condition_time_utc: currentCondition.marine.time_utc,
          current_condition_rating: currentCondition.picked.finalRating ?? currentCondition.scored?.rating ?? null,
        },
        extras: {
          wx_cache_ttl_ms: WX_CACHE_TTL_MS,
          sst_cache_ttl_ms: SST_CACHE_TTL_MS,
        },
      },
    }, compactOn)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[surf-score:error]', {
      message,
      name: e instanceof Error ? e.name : null,
      stack: e instanceof Error ? e.stack : null,
      url: req.url,
    })
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
