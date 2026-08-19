import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
register('./typescript-test-loader.mjs', import.meta.url)

const {
  MIN_PERSONAL_EXPERIENCES,
  SURF_DICE_MIN_PERSONAL_CONFIDENCE,
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
  assert.equal(surfExperienceDisplayDecision({ sampleCount: MIN_PERSONAL_EXPERIENCES - 1, confidence: 1 }).experienceDisplayReason, 'insufficient_personal_samples')
  assert.equal(surfExperienceDisplayDecision({ sampleCount: MIN_PERSONAL_EXPERIENCES, confidence: SURF_DICE_MIN_PERSONAL_CONFIDENCE - 0.01 }).experienceDisplayReason, 'low_personal_confidence')
  assert.equal(surfExperienceDisplayDecision({ sampleCount: MIN_PERSONAL_EXPERIENCES, confidence: SURF_DICE_MIN_PERSONAL_CONFIDENCE }).experienceDisplayReason, 'strong_personal_match')
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
