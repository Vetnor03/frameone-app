import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
register('./typescript-test-loader.mjs', import.meta.url)

const {
  MIN_PERSONAL_EXPERIENCES,
  SURF_DICE_MIN_MATCH_QUALITY,
  SURF_DICE_MIN_PERSONAL_CONFIDENCE,
  exactSurfExperienceForForecast,
  scoreSurf,
  surfExperienceDisplayDecision,
} = await import('../app/lib/surfScoring.ts')
const { normalizeSurfRating1to6, surfRatingIsExperienceBased } = await import('../app/lib/surf/ratings.ts')

const conditions = {
  spotKey: 'Bore',
  swellHeightM: 1.2,
  swellPeriodS: 10,
  swellDirDeg: 280,
  windSpeedMs: 3,
  windDirDeg: 100,
}

function row(i, scope = 'personal', overrides = {}) {
  return {
    id: `r${i}`,
    user_id: scope === 'shared' ? `shared-user-${i % 4}` : 'personal-user',
    spot_id: 'bore',
    logged_at: new Date().toISOString(),
    wave_height_m: 1.2,
    wave_period_s: 10,
    wave_dir_from_deg: 280,
    wind_speed_ms: 3,
    wind_dir_from_deg: 100,
    rating_1_6: 6,
    calibration_scope: scope,
    ...overrides,
  }
}

test('presentation decision is conservative and explainable', () => {
  assert.deepEqual(surfExperienceDisplayDecision(null), {
    experienceDisplay: 'normal', experienceDisplayReason: 'no_personal_evidence',
  })
  assert.equal(surfExperienceDisplayDecision({ sampleCount: MIN_PERSONAL_EXPERIENCES - 1, confidence: 1, matchQuality: 1 }).experienceDisplayReason, 'insufficient_personal_samples')
  assert.equal(surfExperienceDisplayDecision({ sampleCount: MIN_PERSONAL_EXPERIENCES, confidence: SURF_DICE_MIN_PERSONAL_CONFIDENCE - 0.01, matchQuality: 1 }).experienceDisplayReason, 'low_personal_confidence')
  assert.equal(surfExperienceDisplayDecision({ sampleCount: MIN_PERSONAL_EXPERIENCES, confidence: 1, matchQuality: SURF_DICE_MIN_MATCH_QUALITY - 0.01 }).experienceDisplayReason, 'weak_personal_match')
  assert.equal(surfExperienceDisplayDecision({ sampleCount: MIN_PERSONAL_EXPERIENCES, confidence: SURF_DICE_MIN_PERSONAL_CONFIDENCE, matchQuality: SURF_DICE_MIN_MATCH_QUALITY }).experienceDisplayReason, 'strong_personal_match')
})

test('an exact forecast timestamp immediately uses the personal rating and dice', () => {
  const result = scoreSurf({
    ...conditions,
    forecastTimeUtc: '2026-09-05T15:00',
    userExperiences: [row(0, 'personal', {
      logged_at: '2026-09-05T17:36:42.517+02:00',
      forecast_time_utc: '2026-09-05T15:00:38.999Z',
      rating_1_6: 2,
    })],
  })

  assert.equal(result.finalRating, 2)
  assert.equal(result.experienceDisplay, 'personal_match')
  assert.equal(result.experienceDisplayReason, 'exact_forecast_time_match')
  assert.equal(normalizeSurfRating1to6(result).experienceDiceValue, 2)
})

test('exact matching is minute-precision, timezone-safe, and rejects nearby forecast buckets', () => {
  const exact = row(0, 'personal', { forecast_time_utc: '2026-09-05T17:36:59.999+02:00' })
  assert.equal(exactSurfExperienceForForecast([exact], '2026-09-05T15:36:00.001Z')?.id, exact.id)
  assert.equal(exactSurfExperienceForForecast([exact], '2026-09-05T15:37Z'), null)
  assert.equal(exactSurfExperienceForForecast([exact], '2026-09-05T16:36Z'), null)
})

test('repeated scoring refreshes neither duplicate nor drift an exact experience', () => {
  const experience = row(0, 'personal', { forecast_time_utc: '2026-09-05T15:00Z', rating_1_6: 5 })
  const refresh = () => scoreSurf({ ...conditions, forecastTimeUtc: '2026-09-05T15:00', userExperiences: [experience, { ...experience }] })
  const first = refresh()
  const second = refresh()
  assert.equal(first.finalRating, 5)
  assert.equal(second.finalRating, 5)
  assert.equal(first.breakdown.experience.recordId, experience.id)
  assert.equal(second.breakdown.experience.recordId, experience.id)
})

test('physical score payload and Mirror normalization resolve the same exact rating', () => {
  const physicalPayload = scoreSurf({
    ...conditions,
    forecastTimeUtc: '2026-09-05T15:00Z',
    userExperiences: [row(0, 'personal', { forecast_time_utc: '2026-09-05T15:00Z', rating_1_6: 4 })],
  })
  const mirrorRating = normalizeSurfRating1to6(physicalPayload)
  assert.equal(physicalPayload.rating, 4)
  assert.equal(mirrorRating.rating, physicalPayload.rating)
  assert.equal(mirrorRating.experienceDiceValue, physicalPayload.rating)
  assert.equal(mirrorRating.ratingFromExperience, true)
})

test('base, legacy/bootstrap, and shared-only influence use the normal icon', () => {
  const base = scoreSurf(conditions)
  const legacy = scoreSurf({ ...conditions, userExperiences: [row(0, 'personal', { calibration_scope: undefined })] })
  const shared = scoreSurf({ ...conditions, userExperiences: Array.from({ length: 8 }, (_, i) => row(i, 'shared')) })

  for (const result of [base, legacy, shared]) {
    assert.equal(result.experienceDisplay, 'normal')
    assert.equal(surfRatingIsExperienceBased(result), false)
  }
})

test('insufficient and low-confidence personal evidence remain normal', () => {
  const insufficient = scoreSurf({ ...conditions, userExperiences: [row(0), row(1)] })
  const old = new Date(Date.now() - 365 * 86400000).toISOString()
  const lowConfidence = scoreSurf({ ...conditions, userExperiences: [row(0, 'personal', { logged_at: old }), row(1, 'personal', { logged_at: old }), row(2, 'personal', { logged_at: old })] })

  assert.equal(insufficient.experienceDisplayReason, 'insufficient_personal_samples')
  assert.equal(lowConfidence.experienceDisplayReason, 'low_personal_confidence')
  assert.equal(surfRatingIsExperienceBased(insufficient), false)
  assert.equal(surfRatingIsExperienceBased(lowConfidence), false)
})

test('strong personal evidence shows dice with or without shared calibration', () => {
  const personal = Array.from({ length: 3 }, (_, i) => row(i))
  const shared = Array.from({ length: 8 }, (_, i) => row(i + 10, 'shared'))
  for (const experiences of [personal, [...shared, ...personal]]) {
    const result = scoreSurf({ ...conditions, userExperiences: experiences })
    assert.equal(result.experienceDisplay, 'personal_match')
    assert.equal(result.experienceDisplayReason, 'strong_personal_match')
    assert.equal(normalizeSurfRating1to6(result).ratingFromExperience, true)
  }
})

test('many mediocre matches cannot replace three genuinely close matches', () => {
  // A 0.8m height difference yields roughly 0.75 geometric condition similarity:
  // qualifying for calibration, and numerous enough for high confidence, but not close.
  const mediocre = Array.from({ length: 50 }, (_, i) => row(i, 'personal', { wave_height_m: 2.0 }))
  const fourMediocre = scoreSurf({ ...conditions, userExperiences: mediocre.slice(0, 4) })
  const fiftyMediocre = scoreSurf({ ...conditions, userExperiences: mediocre })
  const close = scoreSurf({ ...conditions, userExperiences: Array.from({ length: 3 }, (_, i) => row(i)) })

  for (const result of [fourMediocre, fiftyMediocre]) {
    assert.ok(result.breakdown.calibration.personalConfidence >= SURF_DICE_MIN_PERSONAL_CONFIDENCE)
    assert.ok(result.breakdown.calibration.personalMatchQuality < SURF_DICE_MIN_MATCH_QUALITY)
    assert.equal(result.experienceDisplay, 'normal')
    assert.equal(result.experienceDisplayReason, 'weak_personal_match')
  }
  assert.ok(close.breakdown.calibration.personalMatchQuality >= SURF_DICE_MIN_MATCH_QUALITY)
  assert.equal(close.experienceDisplay, 'personal_match')
})

test('AI enrichment follows personal relevance; annotation alone cannot show dice', () => {
  const analysis = { confidence: 0.9, drivers: [{ dimension: 'wave_height', strength: 0.8 }] }
  const oneAnnotated = scoreSurf({ ...conditions, userExperiences: [row(0, 'personal', { comment_ai_version: 'surf-comment-v1', comment_ai_analysis: analysis })] })
  const enrichedPersonal = scoreSurf({ ...conditions, userExperiences: Array.from({ length: 3 }, (_, i) => row(i, 'personal', { comment_ai_version: 'surf-comment-v1', comment_ai_analysis: analysis })) })
  assert.equal(oneAnnotated.experienceDisplay, 'normal')
  assert.equal(enrichedPersonal.experienceDisplay, 'personal_match')
})

test('explicit presentation semantics change only the symbol, never scorer output', () => {
  const result = scoreSurf({ ...conditions, userExperiences: Array.from({ length: 3 }, (_, i) => row(i)) })
  const oldPayload = structuredClone(result)
  delete oldPayload.experienceDisplay
  delete oldPayload.experienceDisplayReason
  delete oldPayload.breakdown.experienceDisplay
  delete oldPayload.breakdown.experienceDisplayReason

  assert.equal(result.finalScore, oldPayload.finalScore)
  assert.equal(result.finalRating, oldPayload.finalRating)
  assert.equal(normalizeSurfRating1to6(result).rating, normalizeSurfRating1to6(oldPayload).rating)
})

test('an explicit normal decision overrides every historical dice heuristic', () => {
  const payload = {
    finalRating: 5,
    experienceDisplay: 'normal',
    experienceAdjustment: 0.75,
    ratingSource: 'experience_blend',
    breakdown: { experience: { matched: true } },
  }
  assert.equal(surfRatingIsExperienceBased(payload), false)
  assert.equal(normalizeSurfRating1to6(payload).rating, 5)
})
