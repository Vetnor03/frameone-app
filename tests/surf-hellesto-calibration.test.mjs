import assert from 'node:assert/strict'
import test from 'node:test'

import TABLES from '../app/lib/surf/waveguide_tables.json' with { type: 'json' }

function fixMojibake(value) {
  const text = String(value ?? '')
  if (!/[ÃÂ]/.test(text)) return text
  try {
    return Buffer.from(text, 'latin1').toString('utf8')
  } catch {
    return text
  }
}

const hellestoKey = Object.keys(TABLES.spots).find((key) => fixMojibake(key) === 'Hellestø')
assert.ok(hellestoKey, 'Hellestø table exists')
const HELLESTO = TABLES.spots[hellestoKey]

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function normDeg(d) {
  let x = Number(d)
  while (x < 0) x += 360
  while (x >= 360) x -= 360
  return x
}

function rawRangeScore(tableKey, value) {
  const rows = [...HELLESTO[tableKey]].sort((a, b) => Number(a.min ?? Number.NEGATIVE_INFINITY) - Number(b.min ?? Number.NEGATIVE_INFINITY))
  for (const row of rows) {
    const min = row.min == null ? Number.NEGATIVE_INFINITY : Number(row.min)
    const max = row.max == null ? Number.POSITIVE_INFINITY : Number(row.max)
    if (value >= min && value <= max) return row.score_1_6
  }
  const next = rows.find((row) => Number.isFinite(Number(row.min)) && value <= Number(row.min))
  return (next ?? rows.at(-1)).score_1_6
}

function rangeAnchor(row) {
  const min = row.min == null ? null : Number(row.min)
  const max = row.max == null ? null : Number(row.max)
  if (Number.isFinite(min) && Number.isFinite(max)) return (min + max) / 2
  if (Number.isFinite(max)) return max
  if (Number.isFinite(min)) return min
  return null
}

function smoothedRangeScore(tableKey, value) {
  const points = [...HELLESTO[tableKey]]
    .sort((a, b) => Number(a.min ?? Number.NEGATIVE_INFINITY) - Number(b.min ?? Number.NEGATIVE_INFINITY))
    .map((row) => ({ anchor: rangeAnchor(row), score: Number(row.score_1_6) }))
    .filter((point) => Number.isFinite(point.anchor))
  if (value <= points[0].anchor) return points[0].score
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (value <= b.anchor) {
      const t = (value - a.anchor) / (b.anchor - a.anchor)
      return clamp(a.score + (b.score - a.score) * t, 1, 6)
    }
  }
  return points.at(-1).score
}

function dirScoreByLabel(tableKey, label) {
  const row = HELLESTO[tableKey].find((entry) => entry.label === label)
  assert.ok(row, `${tableKey} ${label} exists`)
  return row.score_1_6
}

function smoothedDirScore(tableKey, deg) {
  const points = HELLESTO[tableKey]
    .map((row) => ({ deg: normDeg(row.dir_from_deg), score: Number(row.score_1_6) }))
    .sort((a, b) => a.deg - b.deg)
  const d = normDeg(deg)
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const bDeg = b.deg <= a.deg ? b.deg + 360 : b.deg
    const valueDeg = d < a.deg ? d + 360 : d
    if (valueDeg >= a.deg && valueDeg <= bDeg) {
      return clamp(a.score + (b.score - a.score) * ((valueDeg - a.deg) / (bDeg - a.deg)), 1, 6)
    }
  }
  return points[0].score
}

function windDirectionMultiplier(windSpeedMs) {
  if (!Number.isFinite(windSpeedMs)) return 0
  if (windSpeedMs < 2) return 0.25
  if (windSpeedMs < 3) return 0.6
  return 1
}

function ratingFromWeightedTotal({ waveDirScore, heightScore, periodScore, windSpeedScore, windDirScore, windSpeed }) {
  const w = TABLES.weights
  const windDirEffectiveWeight = w.wind_dir * windDirectionMultiplier(windSpeed)
  const weightedTotal =
    waveDirScore * w.wave_dir +
    heightScore * w.wave_height +
    periodScore * w.wave_period +
    windSpeedScore * w.wind_speed +
    windDirScore * windDirEffectiveWeight +
    w.base
  const maxWeightedTotal = 6 * w.wave_dir + 6 * w.wave_height + 6 * w.wave_period + 6 * w.wind_speed + 6 * windDirEffectiveWeight + w.base
  const finalScoreFloat = (weightedTotal / maxWeightedTotal) * 6
  return { weightedTotal, maxWeightedTotal, finalScoreFloat, rating: clamp(Math.round(finalScoreFloat), 1, 6) }
}

function modelRating({ waveDir, height, period, windSpeed, windDir }) {
  return ratingFromWeightedTotal({
    waveDirScore: dirScoreByLabel('wave_dir', waveDir),
    heightScore: smoothedRangeScore('wave_height', height),
    periodScore: smoothedRangeScore('wave_period', period),
    windSpeedScore: smoothedRangeScore('wind_speed', windSpeed),
    windDirScore: dirScoreByLabel('wind_dir', windDir),
    windSpeed,
  })
}

function modelRatingByDegrees({ waveDirDeg, height, period, windSpeed, windDirDeg }) {
  return ratingFromWeightedTotal({
    waveDirScore: smoothedDirScore('wave_dir', waveDirDeg),
    heightScore: smoothedRangeScore('wave_height', height),
    periodScore: smoothedRangeScore('wave_period', period),
    windSpeedScore: smoothedRangeScore('wind_speed', windSpeed),
    windDirScore: smoothedDirScore('wind_dir', windDirDeg),
    windSpeed,
  })
}

test('Hellestø 6s period scoring fades instead of jumping at the old bucket edge', () => {
  assert.equal(rawRangeScore('wave_period', 5.95), 2)
  assert.equal(rawRangeScore('wave_period', 6.1), 4)

  const periods = [5.8, 5.95, 6.1, 6.3]
  const smoothed = periods.map((period) => smoothedRangeScore('wave_period', period))
  for (let i = 1; i < smoothed.length; i++) {
    assert.ok(Math.abs(smoothed[i] - smoothed[i - 1]) < 0.25, `${periods[i - 1]}s→${periods[i]}s changed smoothly`)
  }
})

test('Hellestø-like morning does not score worse than noon solely from a 6s period bucket jump', () => {
  const morning = modelRatingByDegrees({ waveDirDeg: 259, height: 0.68, period: 5.95, windSpeed: 1.1, windDirDeg: 101 })
  const noon = modelRatingByDegrees({ waveDirDeg: 260, height: 0.64, period: 6.1, windSpeed: 3.6, windDirDeg: 330 })

  assert.ok(morning.rating >= noon.rating, `morning=${morning.rating}, noon=${noon.rating}`)
  assert.ok(morning.weightedTotal >= noon.weightedTotal, `morning total=${morning.weightedTotal}, noon total=${noon.weightedTotal}`)
})

test('Hellestø 6s wind swell still needs genuinely good direction and wind for high scores', () => {
  const perfect = modelRating({ waveDir: 'NW', height: 0.8, period: 6, windSpeed: 3, windDir: 'E' })
  assert.ok(perfect.rating >= 4)

  const lessAligned = modelRating({ waveDir: 'W', height: 0.8, period: 6, windSpeed: 3, windDir: 'E' })
  assert.ok(lessAligned.weightedTotal < perfect.weightedTotal)
})

test('Hellestø 7-8 m/s wind requires favorable direction to stay maybe okay', () => {
  assert.equal(rawRangeScore('wind_speed', 8), 2)

  const favorable = modelRating({ waveDir: 'NW', height: 1.2, period: 7, windSpeed: 8, windDir: 'E' })
  const badDirection = modelRating({ waveDir: 'NW', height: 1.2, period: 7, windSpeed: 8, windDir: 'W' })

  assert.ok(favorable.rating > badDirection.rating)
})

test('Hellestø calm wind reduces bad wind-direction importance', () => {
  const calmBad = modelRatingByDegrees({ waveDirDeg: 259, height: 0.68, period: 5.95, windSpeed: 1.1, windDirDeg: 270 })
  const calmGood = modelRatingByDegrees({ waveDirDeg: 259, height: 0.68, period: 5.95, windSpeed: 1.1, windDirDeg: 101 })

  assert.ok(calmGood.weightedTotal - calmBad.weightedTotal <= TABLES.weights.wind_dir * 6 * 0.25)
  assert.ok(calmGood.rating - calmBad.rating <= 1)
})
