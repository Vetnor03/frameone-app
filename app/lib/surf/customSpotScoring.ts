export type CustomDirectionSector = {
  startDeg: number
  endDeg: number
  mainDeg: number
}

export type CustomDirectionScoreRow = {
  dir_from_deg: number
  score_1_6: number
}

export type NormalizedCustomDirectionScoring = CustomDirectionSector & {
  table: CustomDirectionScoreRow[]
}

export type CustomSpotScoringProfile = {
  waveDir?: CustomDirectionSector | NormalizedCustomDirectionScoring | null
  windDir?: CustomDirectionSector | NormalizedCustomDirectionScoring | null
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
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

function isDegFinite(d: number) {
  return Number.isFinite(Number(d))
}

function sectorSpanDeg(start: number, end: number) {
  const s = normDeg(start)
  const e = normDeg(end)
  return s <= e ? e - s : 360 - s + e
}

function degInSector(deg: number, start: number, end: number) {
  const d = normDeg(deg)
  const s = normDeg(start)
  const e = normDeg(end)
  return s <= e ? d >= s && d <= e : d >= s || d <= e
}

function nearestSectorBoundaryDeg(deg: number, start: number, end: number) {
  const s = normDeg(start)
  const e = normDeg(end)
  return angDistDeg(deg, s) <= angDistDeg(deg, e) ? s : e
}

function normalizeCustomDirectionSectorPlain(sector: CustomDirectionSector): CustomDirectionSector | null {
  const startDeg = Number(sector.startDeg)
  const endDeg = Number(sector.endDeg)
  const rawMainDeg = Number(sector.mainDeg)
  if (!isDegFinite(startDeg) || !isDegFinite(endDeg) || !isDegFinite(rawMainDeg)) return null
  const start = normDeg(startDeg)
  const end = normDeg(endDeg)
  const span = sectorSpanDeg(start, end)
  if (!(span > 0) || span > 360) return null
  return {
    startDeg: start,
    endDeg: end,
    mainDeg: degInSector(rawMainDeg, start, end) ? normDeg(rawMainDeg) : nearestSectorBoundaryDeg(rawMainDeg, start, end),
  }
}

export function scoreCustomDirectionInSector(degFrom: number, sector: CustomDirectionSector): number {
  const normalized = normalizeCustomDirectionSectorPlain(sector)
  if (!normalized) return 1
  if (!degInSector(degFrom, normalized.startDeg, normalized.endDeg)) return 1

  const dStart = angDistDeg(normalized.mainDeg, normalized.startDeg)
  const dEnd = angDistDeg(normalized.mainDeg, normalized.endDeg)
  const maxDist = Math.max(1, dStart, dEnd)
  const dMain = angDistDeg(degFrom, normalized.mainDeg)
  const t = Math.max(0, 1 - dMain / maxDist)
  return clamp(Math.round(1 + t * 5), 1, 6)
}

export function normalizeCustomDirectionSector(sector?: CustomDirectionSector | null): NormalizedCustomDirectionScoring | null {
  if (!sector) return null
  const base = normalizeCustomDirectionSectorPlain(sector)
  if (!base) return null

  return {
    ...base,
    table: Array.from({ length: 72 }, (_, i) => i * 5).map((dir_from_deg) => ({
      dir_from_deg,
      score_1_6: scoreCustomDirectionInSector(dir_from_deg, base),
    })),
  }
}

export function normalizeCustomSpotScoringProfile(profile?: CustomSpotScoringProfile | null): CustomSpotScoringProfile | null {
  if (!profile) return null
  const waveDir = normalizeCustomDirectionSector(profile.waveDir ?? null)
  const windDir = normalizeCustomDirectionSector(profile.windDir ?? null)
  if (!waveDir && !windDir) return null
  return { waveDir, windDir }
}
