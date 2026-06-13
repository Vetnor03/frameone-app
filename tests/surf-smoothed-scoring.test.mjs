import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function smoothedRangeScore(rows, value) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const prev = rows[i - 1]
    if (!prev) continue

    const prevMax = prev.max == null ? Number.NaN : Number(prev.max)
    const min = row.min == null ? Number.NaN : Number(row.min)
    const max = row.max == null ? Number.NaN : Number(row.max)
    const prevMin = prev.min == null ? Number.NaN : Number(prev.min)
    const nextMin = rows[i + 1]?.min == null ? Number.NaN : Number(rows[i + 1].min)
    if (!Number.isFinite(min)) continue

    const rampStart = Number.isFinite(prevMax) ? prevMax : min
    const rampEnd = Number.isFinite(nextMin)
      ? nextMin
      : Number.isFinite(max)
        ? max
        : min + (Number.isFinite(prevMin) ? Math.max(1, rampStart - prevMin) : Math.max(1, min - rampStart))

    if (value < rampStart || value > rampEnd) continue
    return clamp(Number(prev.score_1_6) + (Number(row.score_1_6) - Number(prev.score_1_6)) * ((value - rampStart) / Math.max(0.000001, rampEnd - rampStart)), 1, 6)
  }
  return Number(rows.at(-1).score_1_6)
}

function roundFinalScore(finalScoreFloat) {
  if (!Number.isFinite(finalScoreFloat)) return 1
  if (finalScoreFloat < 2.2) return 1
  if (finalScoreFloat < 3.4) return 2
  if (finalScoreFloat < 4.4) return 3
  if (finalScoreFloat < 5.2) return 4
  if (finalScoreFloat < 5.75) return 5
  return 6
}

function buildQualityPenalties({ periodScore, windSpeedScore, windDirectionScore, windSpeedMs, swellDirectionScore, heightScore }) {
  const penalties = []
  if (periodScore <= 1.5) penalties.push({ component: 'period_score', score: periodScore, penalty: -0.75, reason: 'Very weak period score gently reduces the weighted score.' })
  else if (periodScore <= 2.0) penalties.push({ component: 'period_score', score: periodScore, penalty: -0.4, reason: 'Weak period score gently reduces the weighted score.' })
  if (windSpeedScore <= 2) penalties.push({ component: 'wind_speed_score', score: windSpeedScore, penalty: -0.5, reason: 'Weak wind speed score gently reduces the weighted score.' })
  if (windDirectionScore <= 1.5 && windSpeedMs >= 4) penalties.push({ component: 'wind_direction_score', score: windDirectionScore, penalty: -0.4, reason: 'Weak wind direction score is penalized only when wind speed is material.' })
  if (swellDirectionScore <= 2) penalties.push({ component: 'swell_direction_score', score: swellDirectionScore, penalty: -0.75, reason: 'Weak swell direction score gently reduces the weighted score.' })
  if (heightScore <= 2) penalties.push({ component: 'height_score', score: heightScore, penalty: -0.75, reason: 'Weak height score gently reduces the weighted score.' })
  const totalPenalty = penalties.reduce((sum, item) => sum + item.penalty, 0)
  if (totalPenalty < -1.25) {
    const scale = 1.25 / Math.abs(totalPenalty)
    return penalties.map((item) => ({ ...item, penalty: item.penalty * scale }))
  }
  return penalties
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
    6 * weights.windDirection
  const finalScoreFloatBeforePenalties = (weightedTotal / maxWeightedTotal) * 6
  const qualityPenalties = buildQualityPenalties({ periodScore, windSpeedScore, windDirectionScore, windSpeedMs: 5, swellDirectionScore, heightScore })
  const finalScoreFloatAfterPenalties = clamp(finalScoreFloatBeforePenalties + qualityPenalties.reduce((sum, item) => sum + item.penalty, 0), 1, 6)
  return { weightedTotal, maxWeightedTotal, finalScoreFloat: finalScoreFloatAfterPenalties, finalScoreFloatBeforePenalties, finalScoreFloatAfterPenalties, qualityPenalties, finalScore: roundFinalScore(finalScoreFloatAfterPenalties) }
}


test('quality penalties softly reduce weak contributors after weighted scoring', () => {
  assert.equal(roundFinalScore(2.19), 1)
  assert.equal(roundFinalScore(2.2), 2)
  assert.equal(roundFinalScore(3.39), 2)
  assert.equal(roundFinalScore(3.4), 3)
  assert.equal(roundFinalScore(4.39), 3)
  assert.equal(roundFinalScore(4.4), 4)
  assert.equal(roundFinalScore(5.19), 4)
  assert.equal(roundFinalScore(5.2), 5)
  assert.equal(roundFinalScore(5.74), 5)
  assert.equal(roundFinalScore(5.75), 6)

  const penalties = buildQualityPenalties({
    periodScore: 1.4,
    windSpeedScore: 2,
    windDirectionScore: 1,
    windSpeedMs: 4,
    swellDirectionScore: 2,
    heightScore: 2,
  })

  assert.deepEqual(penalties.map((item) => item.component), [
    'period_score',
    'wind_speed_score',
    'wind_direction_score',
    'swell_direction_score',
    'height_score',
  ])
  assert.ok(Math.abs(penalties.reduce((sum, item) => sum + item.penalty, 0) + 1.25) < 0.001)

  const uncapped = buildQualityPenalties({
    periodScore: 1.75,
    windSpeedScore: 6,
    windDirectionScore: 6,
    windSpeedMs: 8,
    swellDirectionScore: 6,
    heightScore: 6,
  })
  assert.equal(uncapped.length, 1)
  assert.equal(uncapped[0].penalty, -0.4)
})
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


test('period smoothing uses neighboring bucket boundaries when ranges have gaps', () => {
  const hellestoLikePeriodRows = [
    { min: 0, max: 3, score_1_6: 1 },
    { min: 4, max: 6, score_1_6: 2 },
    { min: 7, max: 9, score_1_6: 4 },
  ]

  assert.equal(smoothedRangeScore(hellestoLikePeriodRows, 3), 1)
  assert.equal(smoothedRangeScore(hellestoLikePeriodRows, 5), 1.5)
  assert.ok(smoothedRangeScore(hellestoLikePeriodRows, 5.95) < 2)
  assert.equal(smoothedRangeScore(hellestoLikePeriodRows, 7), 2)
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

  assert.equal(calmBadDirection.maxWeightedTotal, 96)
  assert.equal(calmGoodDirection.maxWeightedTotal, 96)
  assert.equal(calmGoodDirection.weightedTotal - calmBadDirection.weightedTotal, 2.5)
  assert.ok(calmGoodDirection.finalScore - calmBadDirection.finalScore <= 1)
})

test('shared surf scoring source contains smoothing, weighted contributions, and debug breakdown fields', () => {
  const scoringHelper = readFileSync(new URL('../app/lib/surfScoring.ts', import.meta.url), 'utf8')
  const surfRoute = readFileSync(new URL('../app/api/surf/score/route.ts', import.meta.url), 'utf8')

  assert.match(scoringHelper, /function smoothedRangeScore/)
  assert.match(scoringHelper, /function buildQualityPenalties/)
  assert.match(scoringHelper, /qualityPenalties: QualityPenalty\[\]/)
  assert.match(scoringHelper, /finalScoreFloatBeforePenalties/)
  assert.match(scoringHelper, /finalScoreFloatAfterPenalties/)
  assert.match(scoringHelper, /sWaveH\.score \* weights\.wave_height/)
  assert.match(scoringHelper, /sWaveP\.score \* weights\.wave_period/)
  assert.match(scoringHelper, /windDirectionEffectiveScore \* weights\.wind_dir/)
  assert.match(scoringHelper, /scoring_breakdown\?: SurfScoringBreakdown/)
  assert.match(surfRoute, /scoring_breakdown: args\.scored\?\.breakdown\?\.scoring_breakdown/)
})
