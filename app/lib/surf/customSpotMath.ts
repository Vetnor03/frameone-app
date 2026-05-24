export function normalizeAngle(deg: number): number {
  const n = deg % 360
  return n < 0 ? n + 360 : n
}

export function angleDistance(a: number, b: number): number {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b))
  return d > 180 ? 360 - d : d
}

export function isAngleInSector(angle: number, start: number, end: number): boolean {
  const a = normalizeAngle(angle)
  const s = normalizeAngle(start)
  const e = normalizeAngle(end)
  if (s <= e) return a >= s && a <= e
  return a >= s || a <= e
}

export function sectorMidpoint(start: number, end: number): number {
  const s = normalizeAngle(start)
  const e = normalizeAngle(end)
  const span = s <= e ? e - s : 360 - s + e
  return normalizeAngle(s + span / 2)
}

export function clampAngleToSector(angle: number, start: number, end: number): number {
  if (isAngleInSector(angle, start, end)) return normalizeAngle(angle)
  return angleDistance(angle, start) <= angleDistance(angle, end) ? normalizeAngle(start) : normalizeAngle(end)
}

export function scoreDirectionInSector(angle: number, start: number, end: number, main: number): number {
  if (!isAngleInSector(angle, start, end)) return 0
  const spanStart = clampAngleToSector(start, start, end)
  const spanEnd = clampAngleToSector(end, start, end)
  const edgeDist = Math.min(angleDistance(angle, spanStart), angleDistance(angle, spanEnd))
  const mainDist = angleDistance(angle, clampAngleToSector(main, start, end))
  const mainScore = Math.max(0, 6 - mainDist / 12)
  const edgeScore = Math.max(1, 2 - edgeDist / 45)
  return Math.max(edgeScore, mainScore)
}
