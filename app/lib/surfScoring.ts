// app/lib/surfScoring.ts  (FULL FILE - copy/paste)
import TABLES from '../lib/surf/waveguide_tables.json'
import EXP from '../lib/surf/waveguide_experience.json'
import {
  normalizeCustomDirectionSector,
  normalizeCustomSpotScoringProfile,
  scoreCustomDirectionInSector,
  type CustomDirectionSector,
  type CustomSpotScoringProfile,
} from './surf/customSpotScoring'

export { normalizeCustomDirectionSector, normalizeCustomSpotScoringProfile, scoreCustomDirectionInSector } from './surf/customSpotScoring'

export type {
  CustomDirectionSector,
  CustomDirectionScoreRow,
  CustomSpotScoringProfile,
  NormalizedCustomDirectionScoring,
} from './surf/customSpotScoring'

type Dir8 = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'
type TableKey = 'wave_dir' | 'wave_height' | 'wave_period' | 'wind_dir' | 'wind_speed'

export type SwellMixComponent = {
  index: number
  height_m: number
  period_s: number
  direction_deg_from: number
}

export type NormalizedSwellMixSignature = {
  spotKey: string
  swells: SwellMixComponent[]
  wind_speed_ms: number
  wind_direction_deg_from: number
  tide_m?: number | null
  forecast_time_utc?: string | null
}

export type UserSurfExperienceRecord = {
  id?: string
  user_id?: string
  spot_id?: string
  spot?: string
  logged_at?: string
  wave_dir_from_deg: number
  wave_height_m: number
  wave_period_s: number
  wind_dir_from_deg: number
  wind_speed_ms: number
  rating_1_6: number
  primary_swell_height_m?: number | null
  primary_swell_period_s?: number | null
  primary_swell_dir_from_deg?: number | null
  secondary_swell_height_m?: number | null
  secondary_swell_period_s?: number | null
  secondary_swell_dir_from_deg?: number | null
  third_swell_height_m?: number | null
  third_swell_period_s?: number | null
  third_swell_dir_from_deg?: number | null
  tide_m?: number | null
  forecast_time_utc?: string | null
  condition_signature?: NormalizedSwellMixSignature | string | null
  selected_swell_index?: number | null
  created_at?: string
  updated_at?: string
}

type ScoreBreakdown = {
  spotKey: string

  inputs: {
    swell_height_m: number
    swell_period_s: number
    swell_direction_deg_from: number
    wind_speed_ms: number
    wind_direction_deg_from: number
    primary_swell?: SwellMixComponent | null
    secondary_swell?: SwellMixComponent | null
    third_swell?: SwellMixComponent | null
    tide_m?: number | null
    forecast_time_utc?: string | null
  }

  experience?: {
    matched: boolean
    rating_1_6?: number
    label?: string
    recordIndex?: number
    error?: number
    source?: string
    source_priority?: 'user' | 'legacy'
    recordId?: string
    tol_pct?: number
    tol_dir_deg?: number

    model_rating_1_6?: number
    blended_rating_1_6?: number
    blended_rating_float?: number
    confidence?: number
    used_records?: number
    considered_records?: number
    user_records_considered?: number
    legacy_records_considered?: number
    user_records_used?: number
    legacy_records_used?: number
    best_similarity?: number
    weighted_user_ratio?: number
    agreement?: number
    recency_factor?: number
    experience_rating_float?: number
    match_type?: 'combined' | 'dominant_only' | 'legacy_single_swell' | 'none'
    best_record?: {
      rating_1_6: number
      source_priority: 'user' | 'legacy'
      recordId?: string
      logged_at?: string
      similarity: number
      distance: number
      wave_height_m: number
      wave_period_s: number
      wave_dir_from_deg: number
      wind_speed_ms: number
      wind_dir_from_deg: number
    }
  }

  tables?: {
    wave_dir: { picked: string; score: number }
    wave_height: { bucket: string; score: number }
    wave_period: { bucket: string; score: number }
    wind_dir: { picked: string; score: number }
    wind_speed: { bucket: string; score: number }
    total: number
    label: string
    weights: {
      wave_dir: number
      wave_height: number
      wave_period: number
      wind_speed: number
      wind_dir: number
      base: number
    }
    killSwitchApplied?: boolean
    killSwitchMultiplier?: number
  }

  custom_spot_scoring_profile?: CustomSpotScoringProfile | null
  selectedMainSwellIndex?: number
  contributingSwellIndexes?: number[]
  swellMixSignature?: NormalizedSwellMixSignature
  experienceMatchType?: 'combined' | 'dominant_only' | 'legacy_single_swell' | 'none'
  experienceConfidence?: number
  modelRating?: number
  experienceRating?: number
  finalRating?: number
  whySelected?: string

  method: string
}


export type SurfScoreResult = {
  rating: number // 1..6
  score: number // same as rating (kept for firmware compatibility)
  line1: string
  line2: string
  breakdown: ScoreBreakdown
}

// ---------------------
// Mojibake + normalization
// ---------------------
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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function normLabel(lbl: string) {
  return String(lbl ?? '').trim().toLowerCase()
}

function degToDir8(deg: number): Dir8 {
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

function normDeg(d: number) {
  let x = d
  while (x < 0) x += 360
  while (x >= 360) x -= 360
  return x
}

function angDistDeg(a: number, b: number) {
  const aa = normDeg(a)
  const bb = normDeg(b)
  let d = Math.abs(aa - bb)
  if (d > 180) d = 360 - d
  return d
}

function safeNum(v: any, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function safePositive(v: any, fallback: number) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// ---------------------
// Rating mapping
// Flat=1, Poor=2, Poor to fair=3, Fair=4, Good=5, Epic=6
// ---------------------
function labelToRating1to6(lbl: string): number {
  const x = normLabel(lbl)

  if (x === 'flat') return 1
  if (x === 'poor') return 2
  if (x === 'poor to fair') return 3
  if (x === 'fair') return 4
  if (x === 'good') return 5
  if (x === 'epic') return 6

    if (x === 'go surf now!' || x === 'go surf now') return 6
  if (x === 'go surf!' || x === 'go surf') return 6

  return 0
}

function expRating1to6ToLabel(rating: number): string {
  const arr: any[] = (EXP as any)?.rating_map_1_6_to_label ?? []
  for (const v of arr) {
    const label = String(v?.label ?? '')
    const values: any[] = Array.isArray(v?.values) ? v.values : []
    for (const vv of values) if (Number(vv) === rating) return label
  }
  return ''
}

// ---------------------
// Helper: mojibake-safe key match in maps
// ---------------------
function findKeyByNormalized(map: Record<string, any> | null | undefined, want: string): string | null {
  if (!map || typeof map !== 'object') return null
  const wantN = normalizeSpotKey(want)

  if (Object.prototype.hasOwnProperty.call(map, want)) return want

  for (const k of Object.keys(map)) {
    if (normalizeSpotKey(k) === wantN) return k
  }
  return null
}

// ---------------------
// Legacy bucket picking (only used for TABLES.tables format)
// ---------------------
function pickBucket(buckets: string[], value: number): string {
  if (!Number.isFinite(value)) return buckets[0] ?? ''
  const v = value

  const plusBuckets = buckets
    .map((b) => b.trim())
    .filter((b) => b.endsWith('+'))
    .map((b) => ({ b, min: parseFloat(b.slice(0, -1)) }))
    .filter((x) => Number.isFinite(x.min))
    .sort((a, b) => a.min - b.min)

  const rangeBuckets = buckets
    .map((b) => b.trim())
    .filter((b) => b.includes('-'))
    .map((b) => {
      const [a, c] = b.split('-').map((x) => parseFloat(x))
      return { b, min: a, max: c }
    })
    .filter((x) => Number.isFinite(x.min) && Number.isFinite(x.max))
    .sort((a, b) => a.min - b.min)

  for (const r of rangeBuckets) {
    if (v >= r.min && v <= r.max) return r.b
  }

  for (let i = plusBuckets.length - 1; i >= 0; i--) {
    if (v >= plusBuckets[i].min) return plusBuckets[i].b
  }

  if (rangeBuckets.length) {
    if (v < rangeBuckets[0].min) return rangeBuckets[0].b
    return rangeBuckets[rangeBuckets.length - 1].b
  }

  return buckets[0] ?? ''
}

// ---------------------
// Tables access (new + current + legacy), mojibake-safe
// ---------------------
function getSpotTables(spotKey: string): any | null {
  const want = normalizeSpotKey(spotKey)
  const T: any = TABLES as any

  if (T && typeof T === 'object' && !Array.isArray(T)) {
    const rootKey = findKeyByNormalized(T as any, want)
    if (rootKey) {
      const v = (T as any)[rootKey]
      if (v && typeof v === 'object' && (v.wave_dir || v.wind_dir)) return v
    }
  }

  const spotsMap: any = T?.spots
  const spotKeyInMap = findKeyByNormalized(spotsMap, want)
  if (spotKeyInMap) return spotsMap[spotKeyInMap]

  return null
}

function getWeights() {
  const w: any = (TABLES as any)?.weights ?? {}
  return {
    wave_dir: Number(w.wave_dir ?? 6),
    wave_height: Number(w.wave_height ?? 5),
    wave_period: Number(w.wave_period ?? 4),
    wind_speed: Number(w.wind_speed ?? 3),
    wind_dir: Number(w.wind_dir ?? 2),
    base: Number(w.base ?? 6),
  }
}

function scoreToLabelFromTables(total: number): string {
  const arr: any[] = (TABLES as any)?.score_to_label ?? (TABLES as any)?.scoreToLabel ?? []
  for (const v of arr) {
    const mn = Number(v?.min ?? -1e9)
    const mx = Number(v?.max ?? 1e9)
    const label = String(v?.label ?? '--')
    if (total >= mn && total <= mx) return label
  }
  return '--'
}

// ---------------------
// Direction score
// ---------------------
if (process.env.NODE_ENV !== 'production') {
  const sanitySector: CustomDirectionSector = { startDeg: 315, endDeg: 45, mainDeg: 0 }
  const outsideWave = scoreCustomDirectionInSector(180, sanitySector)
  const edgeWave = scoreCustomDirectionInSector(315, sanitySector)
  const mainWave = scoreCustomDirectionInSector(0, sanitySector)
  const wrapWave = scoreCustomDirectionInSector(350, sanitySector)
  console.assert(outsideWave === 1, 'Sanity: outside-sector custom direction scores 1')
  console.assert(edgeWave === 1, 'Sanity: sector edge custom direction scores 1')
  console.assert(mainWave === 6, 'Sanity: main custom direction scores 6')
  console.assert(wrapWave > 1, 'Sanity: wraparound sectors use circular distance')
}


function customSpotProfileForBreakdown(profile?: CustomSpotScoringProfile | null): CustomSpotScoringProfile | null {
  const normalized = normalizeCustomSpotScoringProfile(profile)
  if (!normalized) return null
  return {
    waveDir: normalized.waveDir
      ? { startDeg: normalized.waveDir.startDeg, endDeg: normalized.waveDir.endDeg, mainDeg: normalized.waveDir.mainDeg }
      : null,
    windDir: normalized.windDir
      ? { startDeg: normalized.windDir.startDeg, endDeg: normalized.windDir.endDeg, mainDeg: normalized.windDir.mainDeg }
      : null,
  }
}

function dirBucketScore1to6(tableKey: 'wave_dir' | 'wind_dir', spotKey: string, degFrom: number, customSpotProfile?: CustomSpotScoringProfile | null) {
  const sector = normalizeCustomDirectionSector(tableKey === 'wave_dir' ? customSpotProfile?.waveDir ?? null : customSpotProfile?.windDir ?? null)
  // Custom-spot sectors are stored/treated as meteorological FROM directions (same as built-in waveguide tables).
  // Build and use a normalized virtual direction table shape so malformed rows do not silently default every score to 1.
  if (sector) return { picked: `${Math.round(normDeg(degFrom))}°`, score: scoreCustomDirectionInSector(degFrom, sector) }

  const st = getSpotTables(spotKey)
  const arr: any[] = Array.isArray(st?.[tableKey]) ? st[tableKey] : []
  if (!arr.length) return { picked: degToDir8(degFrom), score: 1 }

  let bestD = Number.POSITIVE_INFINITY
  let bestScore = 1
  let bestLabel: string = degToDir8(degFrom)

  for (const v of arr) {
    const d0 = Number(v?.dir_from_deg ?? v?.deg)
    const sc = Number(v?.score_1_6 ?? v?.score)
    if (!Number.isFinite(d0)) continue

    const dist = angDistDeg(degFrom, d0)
    if (dist < bestD) {
      bestD = dist
      bestScore = clamp(Math.round(Number.isFinite(sc) ? sc : 1), 1, 6)
      const lbl = v?.label
      bestLabel = lbl != null && String(lbl).trim() !== '' ? String(lbl) : `${d0}°`
    }
  }

  return { picked: bestLabel, score: bestScore }
}

// ---------------------
// Range score (min/max arrays) + legacy fallback
// ---------------------
function rangeScore1to6(tableKey: 'wave_height' | 'wave_period' | 'wind_speed', spotKey: string, value: number) {
  const st = getSpotTables(spotKey)

  const mkLabel = (b: any) => {
    const lbl = String(b?.label ?? '').trim()
    if (lbl) return lbl
    const mn = b?.min
    const mxRaw = b?.max
    const mx = mxRaw === null || mxRaw === undefined ? null : mxRaw
    if (Number.isFinite(Number(mn)) && (mx === null || Number.isFinite(Number(mx)))) {
      return mx === null ? `${mn}+` : `${mn}-${mx}`
    }
    return ''
  }

  const arrRaw: any[] = Array.isArray(st?.[tableKey]) ? st[tableKey] : []
  if (arrRaw.length) {
    const v = Number.isFinite(value) ? value : 0
    const arr = [...arrRaw].sort((a, b) => Number(a?.min ?? 0) - Number(b?.min ?? 0))

    for (const b of arr) {
      const mn = Number(b?.min ?? Number.NEGATIVE_INFINITY)
      const mxRaw = b?.max
      const mx = mxRaw === null || mxRaw === undefined ? Number.POSITIVE_INFINITY : Number(mxRaw)
      if (!Number.isFinite(mn) || !Number.isFinite(mx)) continue
      if (v >= mn && v <= mx) {
        return { bucket: mkLabel(b), score: clamp(Math.round(Number(b?.score_1_6 ?? 1)), 1, 6) }
      }
    }

    for (const b of arr) {
      const mn = Number(b?.min)
      if (!Number.isFinite(mn)) continue
      if (v <= mn) {
        return { bucket: mkLabel(b), score: clamp(Math.round(Number(b?.score_1_6 ?? 1)), 1, 6) }
      }
    }

    const last = arr[arr.length - 1]
    return { bucket: mkLabel(last), score: clamp(Math.round(Number(last?.score_1_6 ?? 1)), 1, 6) }
  }

  const legacyTable = (TABLES as any)?.tables?.[tableKey]
  const buckets: string[] = Array.isArray(legacyTable?.buckets) ? legacyTable.buckets : []
  if (buckets.length) {
    const bucket = pickBucket(buckets, value)
    const row = legacyTable?.spots?.[normalizeSpotKey(spotKey)]
    const sc = Number(row?.[bucket] ?? 1)
    return { bucket, score: clamp(Math.round(sc), 1, 6) }
  }

  return { bucket: '', score: 1 }
}

// ---------------------
// Experience access
// ---------------------
function getExperienceRecordsForSpot(spotKey: string): { records: any[]; source: string } {
  const want = normalizeSpotKey(spotKey)
  const E: any = EXP as any

  if (Array.isArray(E)) {
    return { records: E.filter((r) => normalizeSpotKey(r?.spot) === want), source: 'exp_root_array' }
  }

  if (E?.spots && typeof E.spots === 'object') {
    const key = findKeyByNormalized(E.spots, want)
    if (key && Array.isArray(E.spots[key])) return { records: E.spots[key], source: 'exp_spots_map' }
  }

  if (Array.isArray(E?.records)) {
    return { records: E.records.filter((r: any) => normalizeSpotKey(r?.spot) === want), source: 'exp_records' }
  }

  return { records: [], source: 'exp_none' }
}

function approxWithinPct(a: number, b: number, pct: number) {
  if (!(a > 0.0001) || !(b > 0.0001)) return false
  return Math.abs(a - b) / a <= pct
}

function getExperienceTolerancePct(): number {
  const raw = Number((EXP as any)?.tolerance_pct_for_match ?? (EXP as any)?.tolerance_pct_for_experience_match ?? 0.1)
  return Number.isFinite(raw) && raw > 0 ? raw : 0.1
}

// ---------------------
// Model baseline
// ---------------------
function buildModelScore(args: {
  spotKey: string
  h: number
  p: number
  sd: number
  ws: number
  wd: number
  customSpotProfile?: CustomSpotScoringProfile | null
}) {
  const weights = getWeights()

  const sWaveDir = dirBucketScore1to6('wave_dir', args.spotKey, args.sd, args.customSpotProfile)
  const sWaveH = rangeScore1to6('wave_height', args.spotKey, args.h)
  const sWaveP = rangeScore1to6('wave_period', args.spotKey, args.p)
  const sWindS = rangeScore1to6('wind_speed', args.spotKey, args.ws)
  const sWindDir = dirBucketScore1to6('wind_dir', args.spotKey, args.wd, args.customSpotProfile)

  let total =
    sWaveDir.score * weights.wave_dir +
    sWaveH.score * weights.wave_height +
    sWaveP.score * weights.wave_period +
    sWindS.score * weights.wind_speed +
    sWindDir.score * weights.wind_dir +
    weights.base

  let killSwitchApplied = false
  const killSwitchMultiplier = 0.1
  if (sWaveDir.score <= 1) {
    total *= killSwitchMultiplier
    killSwitchApplied = true
  }

  const label = scoreToLabelFromTables(total)
  const rating = clamp(labelToRating1to6(label) || 1, 1, 6)

  return {
    rating,
    tables: {
      wave_dir: { picked: sWaveDir.picked, score: sWaveDir.score },
      wave_height: { bucket: sWaveH.bucket, score: sWaveH.score },
      wave_period: { bucket: sWaveP.bucket, score: sWaveP.score },
      wind_dir: { picked: sWindDir.picked, score: sWindDir.score },
      wind_speed: { bucket: sWindS.bucket, score: sWindS.score },
      total,
      label,
      weights,
      killSwitchApplied,
      killSwitchMultiplier,
    },
  }
}


function swellEnergyForMix(s: SwellMixComponent) {
  const h = Number.isFinite(s.height_m) ? s.height_m : 0
  const period = Number.isFinite(s.period_s) ? s.period_s : 0
  if (!(h > 0) || !(period > 0)) return 0
  return h * period
}

function normalizeSwellComponent(raw: any, index: number): SwellMixComponent | null {
  const height = safeNum(raw?.height_m ?? raw?.height ?? raw?.wave_height_m, 0)
  const period = safeNum(raw?.period_s ?? raw?.period ?? raw?.wave_period_s, 0)
  const dir = safeNum(raw?.direction_deg_from ?? raw?.dir ?? raw?.wave_dir_from_deg ?? raw?.wave_dir_deg_from, 0)
  if (!(height > 0.01) || !(period > 0)) return null
  return {
    index,
    height_m: Math.round(height * 100) / 100,
    period_s: Math.round(period * 10) / 10,
    direction_deg_from: Math.round(normDeg(dir)),
  }
}

function componentHitsSpot(spotKey: string, s: SwellMixComponent, customSpotProfile?: CustomSpotScoringProfile | null) {
  return s.height_m >= 0.35 && s.period_s >= 5 && dirBucketScore1to6('wave_dir', spotKey, s.direction_deg_from, customSpotProfile).score > 1
}

function buildSwellMixSignature(args: {
  spotKey: string
  swells?: SwellMixComponent[]
  fallback: SwellMixComponent
  windSpeed: number
  windDirFrom: number
  tideM?: number | null
  forecastTimeUtc?: string | null
  customSpotProfile?: CustomSpotScoringProfile | null
}): NormalizedSwellMixSignature {
  const source = Array.isArray(args.swells) && args.swells.length ? args.swells : [args.fallback]
  const swells = source
    .map((s, i) => normalizeSwellComponent(s, Number.isFinite(s?.index) ? Number(s.index) : i + 1))
    .filter((s): s is SwellMixComponent => !!s)
    .sort((a, b) => a.index - b.index)

  return {
    spotKey: normalizeSpotKey(args.spotKey),
    swells,
    wind_speed_ms: Math.round(safeNum(args.windSpeed, 0) * 10) / 10,
    wind_direction_deg_from: Math.round(normDeg(safeNum(args.windDirFrom, 0))),
    ...(args.tideM != null && Number.isFinite(Number(args.tideM)) ? { tide_m: Math.round(Number(args.tideM) * 100) / 100 } : {}),
    ...(args.forecastTimeUtc ? { forecast_time_utc: String(args.forecastTimeUtc) } : {}),
  }
}

function parseRecordSignature(r: any, spotKey: string): { signature: NormalizedSwellMixSignature; matchType: 'combined' | 'dominant_only' | 'legacy_single_swell' } {
  let parsed: any = null
  const rawSig = r?.condition_signature ?? r?.swell_mix_signature
  if (rawSig) {
    if (typeof rawSig === 'string') {
      try { parsed = JSON.parse(rawSig) } catch { parsed = null }
    } else if (typeof rawSig === 'object') {
      parsed = rawSig
    }
  }

  const parsedSwells = Array.isArray(parsed?.swells)
    ? parsed.swells
        .map((x: any, i: number) => normalizeSwellComponent(x, Number.isFinite(Number(x?.index)) ? Number(x.index) : i + 1))
        .filter(Boolean) as SwellMixComponent[]
    : []

  if (parsedSwells.length) {
    return {
      signature: buildSwellMixSignature({
        spotKey: String(parsed?.spotKey ?? spotKey),
        swells: parsedSwells,
        fallback: parsedSwells[0],
        windSpeed: safeNum(parsed?.wind_speed_ms ?? r?.wind_speed_ms, 0),
        windDirFrom: safeNum(parsed?.wind_direction_deg_from ?? r?.wind_dir_from_deg ?? r?.wind_dir_deg_from, 0),
        tideM: parsed?.tide_m ?? r?.tide_m,
        forecastTimeUtc: parsed?.forecast_time_utc ?? r?.forecast_time_utc ?? r?.logged_at,
      }),
      matchType: parsedSwells.length >= 2 ? 'combined' : 'dominant_only',
    }
  }

  const fullSwells: SwellMixComponent[] = []
  const p = normalizeSwellComponent({ height_m: r?.primary_swell_height_m, period_s: r?.primary_swell_period_s, direction_deg_from: r?.primary_swell_dir_from_deg }, 1)
  const sec = normalizeSwellComponent({ height_m: r?.secondary_swell_height_m, period_s: r?.secondary_swell_period_s, direction_deg_from: r?.secondary_swell_dir_from_deg }, 2)
  const third = normalizeSwellComponent({ height_m: r?.third_swell_height_m, period_s: r?.third_swell_period_s, direction_deg_from: r?.third_swell_dir_from_deg }, 3)
  if (p) fullSwells.push(p)
  if (sec) fullSwells.push(sec)
  if (third) fullSwells.push(third)

  if (fullSwells.length) {
    return {
      signature: buildSwellMixSignature({
        spotKey,
        swells: fullSwells,
        fallback: fullSwells[0],
        windSpeed: safeNum(r?.wind_speed_ms, 0),
        windDirFrom: safeNum(r?.wind_dir_from_deg ?? r?.wind_dir_deg_from, 0),
        tideM: r?.tide_m,
        forecastTimeUtc: r?.forecast_time_utc ?? r?.logged_at,
      }),
      matchType: fullSwells.length >= 2 ? 'combined' : 'dominant_only',
    }
  }

  const legacy = normalizeSwellComponent({ height_m: r?.wave_height_m, period_s: r?.wave_period_s, direction_deg_from: r?.wave_dir_from_deg ?? r?.wave_dir_deg_from }, Number(r?.selected_swell_index ?? 1) || 1) ?? {
    index: Number(r?.selected_swell_index ?? 1) || 1,
    height_m: safeNum(r?.wave_height_m, 0),
    period_s: safeNum(r?.wave_period_s, 0),
    direction_deg_from: safeNum(r?.wave_dir_from_deg ?? r?.wave_dir_deg_from, 0),
  }

  return {
    signature: buildSwellMixSignature({
      spotKey,
      swells: [legacy],
      fallback: legacy,
      windSpeed: safeNum(r?.wind_speed_ms, 0),
      windDirFrom: safeNum(r?.wind_dir_from_deg ?? r?.wind_dir_deg_from, 0),
      tideM: r?.tide_m,
      forecastTimeUtc: r?.forecast_time_utc ?? r?.logged_at,
    }),
    matchType: 'legacy_single_swell',
  }
}

function swellMixDistance(target: NormalizedSwellMixSignature, record: NormalizedSwellMixSignature) {
  const t = target.swells
  const r = record.swells
  const maxLen = Math.max(t.length, r.length, 1)
  let sum = 0

  for (let i = 0; i < maxLen; i++) {
    const ts = t[i]
    const rs = r[i]
    if (ts && rs) {
      sum += normalizedPctDistance(ts.height_m, rs.height_m, 0.25) * 1.35
      sum += normalizedPctDistance(ts.period_s, rs.period_s, 1) * 1.15
      sum += normalizedDirDistance(ts.direction_deg_from, rs.direction_deg_from) * 1.45
      sum += Math.abs((swellEnergyForMix(ts) / Math.max(1, t.reduce((a, x) => a + swellEnergyForMix(x), 0))) - (swellEnergyForMix(rs) / Math.max(1, r.reduce((a, x) => a + swellEnergyForMix(x), 0)))) * 0.85
    } else {
      const only = ts ?? rs
      const share = only ? swellEnergyForMix(only) / Math.max(1, (ts ? t : r).reduce((a, x) => a + swellEnergyForMix(x), 0)) : 1
      sum += 1.15 + share
    }
  }

  return sum / maxLen
}

// ---------------------
// Confidence-weighted experience model
// ---------------------
type ExperienceMatchArgs = {
  spotKey: string
  waveH: number
  waveDirFrom: number
  wavePeriod: number
  windSpeed: number
  windDirFrom: number
  swellMixSignature: NormalizedSwellMixSignature
  userExperiences?: UserSurfExperienceRecord[]
  modelRating: number
}

type ExperienceCandidate = {
  idx: number
  rating: number
  source: string
  source_priority: 'user' | 'legacy'
  recordId?: string
  logged_at?: string

  wave_height_m: number
  wave_period_s: number
  wave_dir_from_deg: number
  wind_speed_ms: number
  wind_dir_from_deg: number
  swell_mix_signature: NormalizedSwellMixSignature
  match_type: 'combined' | 'dominant_only' | 'legacy_single_swell'

  err: number
  similarity: number
  weight: number
}

type ExperienceBlendResult = {
  matched: boolean
  rating_1_6?: number
  label?: string
  recordIndex?: number
  error?: number
  source?: string
  source_priority?: 'user' | 'legacy'
  recordId?: string
  tol_pct: number
  tol_dir_deg: number

  model_rating_1_6: number
  blended_rating_1_6: number
  blended_rating_float: number
  confidence: number
  used_records: number
  considered_records: number
  user_records_considered: number
  legacy_records_considered: number
  user_records_used: number
  legacy_records_used: number
  best_similarity: number
  weighted_user_ratio: number
  agreement: number
  recency_factor: number
  experience_rating_float?: number
  match_type: 'combined' | 'dominant_only' | 'legacy_single_swell' | 'none'
  best_record?: {
    rating_1_6: number
    source_priority: 'user' | 'legacy'
    recordId?: string
    logged_at?: string
    similarity: number
    distance: number
    wave_height_m: number
    wave_period_s: number
    wave_dir_from_deg: number
    wind_speed_ms: number
    wind_dir_from_deg: number
    swell_mix_signature?: NormalizedSwellMixSignature
    match_type?: 'combined' | 'dominant_only' | 'legacy_single_swell'
  }
}

function daysAgoFromIso(iso?: string): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const d = (Date.now() - t) / (24 * 60 * 60 * 1000)
  return Number.isFinite(d) ? Math.max(0, d) : null
}

function decayHalfLife(days: number, halfLifeDays: number) {
  if (!(days >= 0) || !(halfLifeDays > 0)) return 1
  return Math.pow(0.5, days / halfLifeDays)
}

function closenessFromNormDistance(d: number) {
  return 1 / (1 + d * d)
}

function normalizedPctDistance(target: number, record: number, floor: number) {
  const denom = Math.max(Math.abs(target), Math.abs(record), floor)
  return Math.abs(target - record) / denom
}

function normalizedDirDistance(a: number, b: number) {
  return angDistDeg(a, b) / 180
}

function getExperienceDirToleranceDeg(): number {
  const tolPct = getExperienceTolerancePct()
  const raw = Number((EXP as any)?.tolerance_dir_deg ?? 360 * tolPct)
  return Number.isFinite(raw) && raw > 0 ? raw : 36
}

function getExperienceConfig() {
  const cfg: any = (EXP as any)?.confidence ?? {}
  return {
    hard_match_pct: safePositive(cfg.hard_match_pct, 0.08),
    hard_match_dir_deg: safePositive(cfg.hard_match_dir_deg, 20),

    max_pct_for_consider: safePositive(cfg.max_pct_for_consider, 0.20),
    max_dir_deg_for_consider: safePositive(cfg.max_dir_deg_for_consider, 35),
    max_distance_for_use: safePositive(cfg.max_distance_for_use, 0.95),

    wave_height_weight: safePositive(cfg.wave_height_weight, 1.35),
    wave_period_weight: safePositive(cfg.wave_period_weight, 1.20),
    wave_dir_weight: safePositive(cfg.wave_dir_weight, 1.45),
    wind_speed_weight: safePositive(cfg.wind_speed_weight, 1.00),
    wind_dir_weight: safePositive(cfg.wind_dir_weight, 1.25),

    user_source_weight: safePositive(cfg.user_source_weight, 1.25),
    legacy_source_weight: safePositive(cfg.legacy_source_weight, 0.45),

    user_near_match_confidence_floor: clamp(safeNum(cfg.user_near_match_confidence_floor, 0.72), 0, 1),
    user_good_match_confidence_floor: clamp(safeNum(cfg.user_good_match_confidence_floor, 0.58), 0, 1),
    legacy_near_match_confidence_floor: clamp(safeNum(cfg.legacy_near_match_confidence_floor, 0.42), 0, 1),

    half_life_days_user: safePositive(cfg.half_life_days_user, 240),
    half_life_days_legacy: safePositive(cfg.half_life_days_legacy, 700),

    min_confidence_to_match: clamp(safeNum(cfg.min_confidence_to_match, 0.50), 0, 1),
    max_blend_confidence: clamp(safeNum(cfg.max_blend_confidence, 0.80), 0, 1),
  }
}

function collectExperienceCandidates(args: ExperienceMatchArgs) {
  const userRecords = Array.isArray(args.userExperiences) ? args.userExperiences : []
  const { records: legacyRecords, source: legacySource } = getExperienceRecordsForSpot(args.spotKey)

  const cfg = getExperienceConfig()

  const candidates: ExperienceCandidate[] = []

  const pushFrom = (
    records: any[],
    source: string,
    sourcePriority: 'user' | 'legacy'
  ) => {
    for (let i = 0; i < records.length; i++) {
      const r = records[i]

      const rating = Math.round(Number(r?.rating_1_6 ?? 0))
      if (rating < 1 || rating > 6) continue

      const { signature: recordSignature, matchType } = parseRecordSignature(r, args.spotKey)
      const dominant = [...recordSignature.swells].sort((a, b) => swellEnergyForMix(b) - swellEnergyForMix(a))[0]
      if (!dominant) continue

      const waveH = dominant.height_m
      const waveP = dominant.period_s
      const waveD = dominant.direction_deg_from
      const windS = safeNum(recordSignature.wind_speed_ms, 0)
      const windD = safeNum(recordSignature.wind_direction_deg_from, 0)

      const dMix = swellMixDistance(args.swellMixSignature, recordSignature)
      const dWindS = normalizedPctDistance(args.windSpeed, windS, 1)
      const dWindDir = normalizedDirDistance(args.windDirFrom, windD)

      const legacyPenalty = matchType === 'legacy_single_swell' ? 0.75 : matchType === 'dominant_only' ? 0.32 : 0
      const err = dMix * 3.7 + dWindS * cfg.wind_speed_weight + dWindDir * cfg.wind_dir_weight + legacyPenalty

      const hasSecondaryTarget = args.swellMixSignature.swells.length >= 2
      const hasSecondaryRecord = recordSignature.swells.length >= 2
      const maxDistanceForUse =
        matchType === 'combined'
          ? cfg.max_distance_for_use
          : matchType === 'dominant_only'
            ? Math.max(cfg.max_distance_for_use, 3.0)
            : Math.max(cfg.max_distance_for_use, 3.2)
      if (hasSecondaryTarget && hasSecondaryRecord && dMix > 0.55) continue
      if (!hasSecondaryTarget && hasSecondaryRecord && dMix > 0.75) continue
      if (!(err <= maxDistanceForUse)) continue
      if (dWindS > cfg.max_pct_for_consider || angDistDeg(args.windDirFrom, windD) > cfg.max_dir_deg_for_consider) continue

      const daysAgo = daysAgoFromIso(r?.logged_at)
      const recency =
        daysAgo == null
          ? (sourcePriority === 'user' ? 0.85 : 0.55)
          : (
              sourcePriority === 'user'
                ? decayHalfLife(daysAgo, cfg.half_life_days_user)
                : decayHalfLife(daysAgo, cfg.half_life_days_legacy)
            )

      const sourceWeight = sourcePriority === 'user' ? cfg.user_source_weight : cfg.legacy_source_weight
      const signatureWeight = matchType === 'combined' ? 1 : matchType === 'dominant_only' ? 0.72 : 0.45
      const similarity = closenessFromNormDistance(err)
      const weight = similarity * recency * sourceWeight * signatureWeight

      if (!(weight > 0)) continue

      candidates.push({
        idx: i,
        rating,
        source,
        source_priority: sourcePriority,
        recordId: r?.id != null ? String(r.id) : undefined,
        logged_at: r?.logged_at != null ? String(r.logged_at) : undefined,
        wave_height_m: waveH,
        wave_period_s: waveP,
        wave_dir_from_deg: waveD,
        wind_speed_ms: windS,
        wind_dir_from_deg: windD,
        swell_mix_signature: recordSignature,
        match_type: matchType,
        err,
        similarity,
        weight,
      })
    }
  }

  pushFrom(userRecords, 'user_surf_experiences', 'user')
  pushFrom(legacyRecords, legacySource, 'legacy')

  candidates.sort((a, b) => b.weight - a.weight)

  return candidates
}

function buildExperienceBlend(args: ExperienceMatchArgs): ExperienceBlendResult {
  const tolPct = getExperienceTolerancePct()
  const tolDirDeg = getExperienceDirToleranceDeg()
  const cfg = getExperienceConfig()

  const candidates = collectExperienceCandidates(args)

  const consideredUserCount = Array.isArray(args.userExperiences) ? args.userExperiences.length : 0
  const legacyInfo = getExperienceRecordsForSpot(args.spotKey)
  const consideredLegacyCount = legacyInfo.records.length

  const empty: ExperienceBlendResult = {
    matched: false,
    tol_pct: tolPct,
    tol_dir_deg: tolDirDeg,
    model_rating_1_6: args.modelRating,
    blended_rating_1_6: args.modelRating,
    blended_rating_float: args.modelRating,
    confidence: 0,
    used_records: 0,
    considered_records: consideredUserCount + consideredLegacyCount,
    user_records_considered: consideredUserCount,
    legacy_records_considered: consideredLegacyCount,
    user_records_used: 0,
    legacy_records_used: 0,
    best_similarity: 0,
    weighted_user_ratio: 0,
    agreement: 0,
    recency_factor: 0,
    source: consideredUserCount > 0 ? 'user_surf_experiences' : legacyInfo.source,
    source_priority: consideredUserCount > 0 ? 'user' : 'legacy',
    match_type: 'none',
  }

  if (!candidates.length) return empty

  const maxUsed = 12
  const used = candidates.slice(0, maxUsed)

  let weightSum = 0
  let ratingSum = 0
  let userWeight = 0
  let recencyWeightSum = 0

  for (const c of used) {
    weightSum += c.weight
    ratingSum += c.weight * c.rating

    const daysAgo = daysAgoFromIso(c.logged_at)
    const recency =
      daysAgo == null
        ? (c.source_priority === 'user' ? 0.85 : 0.55)
        : (
            c.source_priority === 'user'
              ? decayHalfLife(daysAgo, cfg.half_life_days_user)
              : decayHalfLife(daysAgo, cfg.half_life_days_legacy)
          )

    recencyWeightSum += c.weight * recency

    if (c.source_priority === 'user') userWeight += c.weight
  }

  if (!(weightSum > 0)) return empty

  const experienceRatingFloat = ratingSum / weightSum
  const experienceRatingRounded = clamp(Math.round(experienceRatingFloat), 1, 6)

  const best = used[0]
  const bestSimilarity = best.similarity
  const weightedUserRatio = userWeight / weightSum
  const recencyFactor = recencyWeightSum / weightSum

  let variance = 0
  for (const c of used) {
    variance += c.weight * Math.pow(c.rating - experienceRatingFloat, 2)
  }
  variance = variance / weightSum
  const agreement = clamp(1 - variance / 6.25, 0, 1)

  const sqSum = used.reduce((acc, c) => acc + c.weight * c.weight, 0)
  const effectiveN = sqSum > 0 ? (weightSum * weightSum) / sqSum : 1
  const countFactor = clamp((effectiveN - 0.8) / 2.2, 0, 1)

  const closenessFactor = clamp((bestSimilarity - 0.35) / 0.55, 0, 1)
  const sourceFactor = clamp(0.65 + 0.35 * weightedUserRatio, 0, 1)

  let confidence =
    closenessFactor * 0.45 +
    countFactor * 0.20 +
    agreement * 0.20 +
    recencyFactor * 0.10 +
    sourceFactor * 0.05

  const hardMix = swellMixDistance(args.swellMixSignature, best.swell_mix_signature) <= (best.match_type === 'combined' ? 0.18 : 0.30)
  const hardWindS = normalizedPctDistance(args.windSpeed, best.wind_speed_ms, 1) <= cfg.hard_match_pct
  const hardWindDir = angDistDeg(args.windDirFrom, best.wind_dir_from_deg) <= cfg.hard_match_dir_deg

  const isHardNearMatch = hardMix && hardWindS && hardWindDir

  if (best.source_priority === 'user' && isHardNearMatch) {
    confidence = Math.max(confidence, cfg.user_near_match_confidence_floor)
  } else if (best.source_priority === 'user' && bestSimilarity >= 0.60) {
    confidence = Math.max(confidence, cfg.user_good_match_confidence_floor)
  } else if (best.source_priority === 'legacy' && isHardNearMatch) {
    confidence = Math.max(confidence, cfg.legacy_near_match_confidence_floor)
  }

  const legacyOnlyCap =
    weightedUserRatio <= 0.001
      ? Math.min(cfg.max_blend_confidence, 0.72)
      : cfg.max_blend_confidence

  const signatureCap = best.match_type === 'combined' ? legacyOnlyCap : best.match_type === 'dominant_only' ? Math.min(legacyOnlyCap, 0.58) : Math.min(legacyOnlyCap, 0.38)

  confidence = clamp(confidence, 0, signatureCap)

const blendedFloat =
  args.modelRating * (1 - confidence) +
  experienceRatingFloat * confidence
  const blendedRounded = clamp(Math.round(blendedFloat), 1, 6)

  const usedUserCount = used.filter((x) => x.source_priority === 'user').length
  const usedLegacyCount = used.filter((x) => x.source_priority === 'legacy').length
  const matched = confidence >= cfg.min_confidence_to_match

  return {
    matched,
    rating_1_6: experienceRatingRounded,
    label: expRating1to6ToLabel(experienceRatingRounded),
    recordIndex: best.idx,
    error: best.err,
    source: best.source,
    source_priority: best.source_priority,
    recordId: best.recordId,

    tol_pct: tolPct,
    tol_dir_deg: tolDirDeg,

    model_rating_1_6: args.modelRating,
    blended_rating_1_6: blendedRounded,
    blended_rating_float: blendedFloat,
    confidence,
    used_records: used.length,
    considered_records: consideredUserCount + consideredLegacyCount,
    user_records_considered: consideredUserCount,
    legacy_records_considered: consideredLegacyCount,
    user_records_used: usedUserCount,
    legacy_records_used: usedLegacyCount,
    best_similarity: bestSimilarity,
    weighted_user_ratio: weightedUserRatio,
    agreement,
    recency_factor: recencyFactor,
    experience_rating_float: experienceRatingFloat,
    match_type: best.match_type,

    best_record: {
      rating_1_6: best.rating,
      source_priority: best.source_priority,
      recordId: best.recordId,
      logged_at: best.logged_at,
      similarity: best.similarity,
      distance: best.err,
      wave_height_m: best.wave_height_m,
      wave_period_s: best.wave_period_s,
      wave_dir_from_deg: best.wave_dir_from_deg,
      wind_speed_ms: best.wind_speed_ms,
      wind_dir_from_deg: best.wind_dir_from_deg,
      swell_mix_signature: best.swell_mix_signature,
      match_type: best.match_type,
    },
  }
}

// ---------------------
// MAIN
// ---------------------
export function scoreSurf(params: {
  spotKey: string
  swellHeightM: number
  swellPeriodS: number
  swellDirDeg: number
  windSpeedMs: number
  windDirDeg: number
  swells?: SwellMixComponent[]
  selectedMainSwellIndex?: number
  tideM?: number | null
  forecastTimeUtc?: string | null
  whySelected?: string
  userExperiences?: UserSurfExperienceRecord[]
  customSpotProfile?: CustomSpotScoringProfile | null
}): SurfScoreResult {
  const spotKey = normalizeSpotKey(params.spotKey)

  const fallbackSwell: SwellMixComponent = {
    index: params.selectedMainSwellIndex ?? 1,
    height_m: Number.isFinite(params.swellHeightM) ? params.swellHeightM : 0,
    period_s: Number.isFinite(params.swellPeriodS) ? params.swellPeriodS : 0,
    direction_deg_from: Number.isFinite(params.swellDirDeg) ? params.swellDirDeg : 0,
  }
  const ws = Number.isFinite(params.windSpeedMs) ? params.windSpeedMs : 0
  const wd = Number.isFinite(params.windDirDeg) ? params.windDirDeg : 0

  const rawSignature = buildSwellMixSignature({
    spotKey,
    swells: params.swells,
    fallback: fallbackSwell,
    windSpeed: ws,
    windDirFrom: wd,
    tideM: params.tideM,
    forecastTimeUtc: params.forecastTimeUtc,
    customSpotProfile: params.customSpotProfile,
  })
  const contributingSwells = rawSignature.swells.filter((s) => componentHitsSpot(spotKey, s, params.customSpotProfile))
  const scoreSwells = contributingSwells.length ? contributingSwells : rawSignature.swells
  const selectedOverride = params.selectedMainSwellIndex != null
    ? scoreSwells.find((s) => s.index === params.selectedMainSwellIndex)
    : null
  const mainSwell = selectedOverride ?? [...scoreSwells].sort((a, b) => swellEnergyForMix(b) - swellEnergyForMix(a))[0] ?? fallbackSwell
  const selectedMainSwellIndex = params.selectedMainSwellIndex ?? mainSwell.index
  const swellMixSignature: NormalizedSwellMixSignature = {
    ...rawSignature,
    swells: scoreSwells,
  }

  const h = mainSwell.height_m
  const p = mainSwell.period_s
  const sd = mainSwell.direction_deg_from

  const line1 = `${h.toFixed(1)}m @ ${Math.round(p)}s`
  const line2 = `${degToDir8(sd)} swell, ${degToDir8(wd)} wind`

  const model = buildModelScore({
    spotKey,
    h,
    p,
    sd,
    ws,
    wd,
    customSpotProfile: params.customSpotProfile,
  })

  const exp = buildExperienceBlend({
    spotKey,
    waveH: h,
    waveDirFrom: sd,
    wavePeriod: p,
    windSpeed: ws,
    windDirFrom: wd,
    swellMixSignature,
    userExperiences: params.userExperiences,
    modelRating: model.rating,
  })

  const finalRating = clamp(exp.blended_rating_1_6 ?? model.rating, 1, 6)

  return {
    rating: finalRating,
    score: finalRating,
    line1,
    line2,
    breakdown: {
      spotKey,
      inputs: {
        swell_height_m: h,
        swell_period_s: p,
        swell_direction_deg_from: sd,
        wind_speed_ms: ws,
        wind_direction_deg_from: wd,
        primary_swell: rawSignature.swells.find((x) => x.index === 1) ?? null,
        secondary_swell: rawSignature.swells.find((x) => x.index === 2) ?? null,
        third_swell: rawSignature.swells.find((x) => x.index === 3) ?? null,
        tide_m: params.tideM ?? null,
        forecast_time_utc: params.forecastTimeUtc ?? null,
      },
      experience: {
        matched: exp.matched,
        rating_1_6: exp.rating_1_6,
        label: exp.label,
        recordIndex: exp.recordIndex,
        error: exp.error,
        source: exp.source,
        source_priority: exp.source_priority,
        recordId: exp.recordId,
        tol_pct: exp.tol_pct,
        tol_dir_deg: exp.tol_dir_deg,

        model_rating_1_6: exp.model_rating_1_6,
        blended_rating_1_6: exp.blended_rating_1_6,
        blended_rating_float: exp.blended_rating_float,
        confidence: exp.confidence,
        used_records: exp.used_records,
        considered_records: exp.considered_records,
        user_records_considered: exp.user_records_considered,
        legacy_records_considered: exp.legacy_records_considered,
        user_records_used: exp.user_records_used,
        legacy_records_used: exp.legacy_records_used,
        best_similarity: exp.best_similarity,
        weighted_user_ratio: exp.weighted_user_ratio,
        agreement: exp.agreement,
        recency_factor: exp.recency_factor,
        experience_rating_float: exp.experience_rating_float,
        match_type: exp.match_type,
        best_record: exp.best_record,
      },
      tables: model.tables,
      custom_spot_scoring_profile: customSpotProfileForBreakdown(params.customSpotProfile),
      selectedMainSwellIndex,
      contributingSwellIndexes: scoreSwells.map((x) => x.index),
      swellMixSignature,
      experienceMatchType: exp.match_type,
      experienceConfidence: exp.confidence,
      modelRating: model.rating,
      experienceRating: exp.rating_1_6,
      finalRating,
      whySelected: params.whySelected,
      method:
        'tables_weighted_total + experience_confidence_blend(user>legacy, recency-weighted, multi-record, dir-aware)',
    },
  }
}