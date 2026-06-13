import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function smoothedRangeScore(rows, value) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const min = row.min == null ? Number.NEGATIVE_INFINITY : Number(row.min)
    const max = row.max == null ? Number.POSITIVE_INFINITY : Number(row.max)
    if (!(value >= min && value < max)) continue
    if (!Number.isFinite(min) || !rows[i - 1]) return Number(row.score_1_6)

    const previousScore = Number(rows[i - 1].score_1_6)
    const bucketScore = Number(row.score_1_6)
    const previousMin = rows[i - 1].min == null ? Number.NEGATIVE_INFINITY : Number(rows[i - 1].min)
    const previousMax = rows[i - 1].max == null ? Number.POSITIVE_INFINITY : Number(rows[i - 1].max)
    const rampWidth = Number.isFinite(max)
      ? max - min
      : Number.isFinite(previousMin) && Number.isFinite(previousMax)
        ? previousMax - previousMin
        : 1
    return clamp(previousScore + (bucketScore - previousScore) * ((value - min) / rampWidth), 1, 6)
  }
  return Number(rows.at(-1).score_1_6)
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

test('generic period table smoothing fades between bucket boundaries', () => {
  const genericPeriodRows = [
    { min: null, max: 5, score_1_6: 1 },
    { min: 5, max: 7, score_1_6: 2 },
    { min: 7, max: 8, score_1_6: 3 },
    { min: 8, max: 11, score_1_6: 4 },
    { min: 11, max: 14, score_1_6: 5 },
    { min: 14, max: null, score_1_6: 6 },
  ]

  assert.equal(smoothedRangeScore(genericPeriodRows, 5.0), 1)
  assert.equal(smoothedRangeScore(genericPeriodRows, 6.0), 1.5)
  assert.equal(smoothedRangeScore(genericPeriodRows, 7.0), 2)
  assert.equal(smoothedRangeScore(genericPeriodRows, 7.5), 2.5)
  assert.equal(smoothedRangeScore(genericPeriodRows, 8.0), 3)
  assert.equal(smoothedRangeScore(genericPeriodRows, 9.5), 3.5)
  assert.equal(smoothedRangeScore(genericPeriodRows, 11.0), 4)
  assert.equal(smoothedRangeScore(genericPeriodRows, 14.0), 5)
  assert.equal(smoothedRangeScore(genericPeriodRows, 15.5), 5.5)

  const aroundBoundary = [6.8, 6.95, 7.1, 7.3].map((period) => smoothedRangeScore(genericPeriodRows, period))
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
