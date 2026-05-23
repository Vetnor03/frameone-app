function norm(d: number) {
  const n = Math.round(Number(d) || 0)
  return ((n % 360) + 360) % 360
}

function angularDistance(a: number, b: number) {
  const d = Math.abs(norm(a) - norm(b))
  return Math.min(d, 360 - d)
}

function inSector(dir: number, start: number, end: number) {
  const d = norm(dir)
  const s = norm(start)
  const e = norm(end)
  return s <= e ? d >= s && d <= e : d >= s || d <= e
}

function sectorSpan(start: number, end: number) {
  const s = norm(start)
  const e = norm(end)
  return s <= e ? e - s : 360 - (s - e)
}

export function scoreDirectionalSector(actualDirection: number, sectorStart: number, sectorEnd: number, bestDirection: number, maxScore = 6) {
  if (!inSector(actualDirection, sectorStart, sectorEnd)) return 0
  const span = Math.max(1, sectorSpan(sectorStart, sectorEnd))
  const maxD = span / 2
  const d = Math.min(angularDistance(actualDirection, bestDirection), maxD)
  const t = 1 - d / maxD
  return Math.max(0, Math.min(maxScore, Math.round(t * maxScore * 100) / 100))
}

// Example behavior:
// scoreDirectionalSector(10, 300, 40, 10) -> 6
// scoreDirectionalSector(200, 300, 40, 10) -> 0
