export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0
  const n = angle % 360
  return n < 0 ? n + 360 : n
}

export function angleDistance(a: number, b: number): number {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b))
  return d > 180 ? 360 - d : d
}

export function isAngleWithinSector(angle: number, startAngle: number, endAngle: number): boolean {
  const a = normalizeAngle(angle)
  const start = normalizeAngle(startAngle)
  const end = normalizeAngle(endAngle)
  if (start <= end) return a >= start && a <= end
  return a >= start || a <= end
}

export function sectorMidpoint(startAngle: number, endAngle: number): number {
  const start = normalizeAngle(startAngle)
  const end = normalizeAngle(endAngle)
  const span = start <= end ? end - start : 360 - start + end
  return normalizeAngle(start + span / 2)
}

export function scoreAngleWithinSector(angle: number, startAngle: number, endAngle: number): number {
  if (!isAngleWithinSector(angle, startAngle, endAngle)) return 0
  const mid = sectorMidpoint(startAngle, endAngle)
  const edgeDist = Math.max(
    angleDistance(mid, normalizeAngle(startAngle)),
    angleDistance(mid, normalizeAngle(endAngle))
  )
  if (edgeDist <= 0) return 1
  const d = angleDistance(angle, mid)
  return Math.max(0, 1 - d / edgeDist)
}
