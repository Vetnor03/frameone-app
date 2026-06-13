import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function smoothedRangeScore(rows, value) {
  const points = rows
    .map((row) => ({
      anchor: row.min == null ? Number(row.max) : row.max == null ? Number(row.min) : (Number(row.min) + Number(row.max)) / 2,
      score: Number(row.score_1_6),
    }))
    .filter((point) => Number.isFinite(point.anchor))
    .sort((a, b) => a.anchor - b.anchor)

  if (value <= points[0].anchor) return points[0].score
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (value <= b.anchor) {
      return clamp(a.score + (b.score - a.score) * ((value - a.anchor) / (b.anchor - a.anchor)), 1, 6)
    }
  }
  return points.at(-1).score
}

function weightedRating({ heightScore, periodScore, swellDirectionScore, windSpeedScore, windDirectionScore, windDirectionMultiplier }) {
  const weights = { swellDirection: 5, height: 4, period: 3, windSpeed: 2, windDirection: 2 }
  const weightedTotal =
    heightScore * weights.height +
    periodScore * weights.period +
    swellDirectionScore * weights.swellDirection +
    windSpeedScore * weights.windSpeed +
    windDirectionScore * weights.windDirection * windDirectionMultiplier
  const maxWeightedTotal =
    6 * weights.height +
    6 * weights.period +
    6 * weights.swellDirection +
    6 * weights.windSpeed +
    6 * weights.windDirection * windDirectionMultiplier
  const finalScoreFloat = (weightedTotal / maxWeightedTotal) * 6
  return { weightedTotal, maxWeightedTotal, finalScoreFloat, finalScore: clamp(Math.round(finalScoreFloat), 1, 6) }
}

test('generic period table smoothing fades across adjacent bucket anchors', () => {
  const genericPeriodRows = [
    { min: 5, max: 6, score_1_6: 2 },
    { min: 6, max: 7, score_1_6: 4 },
    { min: 7, max: 8, score_1_6: 5 },
  ]

  assert.equal(smoothedRangeScore(genericPeriodRows, 5.5), 2)
  assert.equal(smoothedRangeScore(genericPeriodRows, 6.0), 3)
  assert.equal(smoothedRangeScore(genericPeriodRows, 6.5), 4)

  const aroundBoundary = [5.8, 5.95, 6.1, 6.3].map((period) => smoothedRangeScore(genericPeriodRows, period))
  for (let i = 1; i < aroundBoundary.length; i++) {
    assert.ok(Math.abs(aroundBoundary[i] - aroundBoundary[i - 1]) < 0.5)
  }
})

test('generic weighted scoring can justify a better calm slot despite a tiny period disadvantage', () => {
  const morning = weightedRating({
    heightScore: 5.1,
    periodScore: 3.15,
    swellDirectionScore: 5,
    windSpeedScore: 6,
    windDirectionScore: 5,
    windDirectionMultiplier: 0.25,
  })
  const noon = weightedRating({
    heightScore: 4.9,
    periodScore: 3.25,
    swellDirectionScore: 5,
    windSpeedScore: 5,
    windDirectionScore: 1,
    windDirectionMultiplier: 1,
  })

  assert.ok(morning.weightedTotal > noon.weightedTotal)
  assert.ok(morning.finalScore >= noon.finalScore)
})

test('generic calm wind reduces bad wind-direction contribution without changing other weights', () => {
  const calmBadDirection = weightedRating({ heightScore: 5, periodScore: 3, swellDirectionScore: 5, windSpeedScore: 6, windDirectionScore: 1, windDirectionMultiplier: 0.25 })
  const calmGoodDirection = weightedRating({ heightScore: 5, periodScore: 3, swellDirectionScore: 5, windSpeedScore: 6, windDirectionScore: 6, windDirectionMultiplier: 0.25 })

  assert.equal(calmGoodDirection.weightedTotal - calmBadDirection.weightedTotal, 2.5)
  assert.ok(calmGoodDirection.finalScore - calmBadDirection.finalScore <= 1)
})

test('shared surf scoring source contains smoothing, weighted contributions, and debug breakdown fields', () => {
  const scoringHelper = readFileSync(new URL('../app/lib/surfScoring.ts', import.meta.url), 'utf8')
  const surfRoute = readFileSync(new URL('../app/api/surf/score/route.ts', import.meta.url), 'utf8')

  assert.match(scoringHelper, /function smoothedRangeScore/)
  assert.match(scoringHelper, /sWaveH\.score \* weights\.wave_height/)
  assert.match(scoringHelper, /sWaveP\.score \* weights\.wave_period/)
  assert.match(scoringHelper, /sWindDir\.score \* windDirectionEffectiveWeight/)
  assert.match(scoringHelper, /scoring_breakdown\?: SurfScoringBreakdown/)
  assert.match(surfRoute, /scoring_breakdown: args\.scored\?\.breakdown\?\.scoring_breakdown/)
})
