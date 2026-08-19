import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
register('./typescript-test-loader.mjs', import.meta.url)
const { scoreSurf, MAX_SHARED_ADJUSTMENT, MAX_PERSONAL_ADJUSTMENT, resetSurfCalibrationCacheStats, getSurfCalibrationCacheStats } = await import('../app/lib/surfScoring.ts')

const current = { spotKey: 'Bore', swellHeightM: 1.2, swellPeriodS: 10, swellDirDeg: 280, windSpeedMs: 3, windDirDeg: 100 }
const now = new Date().toISOString()
function row(i, rating, scope = 'shared', overrides = {}) {
  return { id: `r${i}`, user_id: `u${i % 4}`, spot_id: 'bore', logged_at: now, wave_height_m: 1.2, wave_period_s: 10, wave_dir_from_deg: 280, wind_speed_ms: 3, wind_dir_from_deg: 100, rating_1_6: rating, calibration_scope: scope, ...overrides }
}
function calibration(records) { return scoreSurf({ ...current, userExperiences: records }).breakdown.calibration }

test('scoped calibration preserves the existing legacy/bootstrap fallback', () => {
  const existing = scoreSurf(current)
  const zeroScoped = scoreSurf({ ...current, userExperiences: [] })
  const onePersonal = scoreSurf({ ...current, userExperiences: [row(1, 6, 'personal')] })
  const insufficientShared = scoreSurf({ ...current, userExperiences: Array.from({ length: 7 }, (_, i) => row(i, 6, 'shared')) })
  assert.equal(zeroScoped.breakdown.experience.blended_rating_float, existing.breakdown.experience.blended_rating_float)
  assert.equal(zeroScoped.rating, existing.rating)
  assert.equal(onePersonal.breakdown.calibration.personalAdjustment, 0)
  assert.equal(insufficientShared.breakdown.calibration.sharedAdjustment, 0)
  assert.equal(onePersonal.breakdown.calibration.bootstrapScore, existing.breakdown.experience.blended_rating_float)
  assert.equal(insufficientShared.breakdown.calibration.bootstrapScore, existing.breakdown.experience.blended_rating_float)
  assert.equal(onePersonal.rating, existing.rating)
  assert.equal(insufficientShared.rating, existing.rating)
})

test('calibration safely falls back without enough shared experiences or users', () => {
  assert.equal(calibration([]), undefined)
  assert.equal(calibration(Array.from({ length: 8 }, (_, i) => row(i, 6, 'shared', { user_id: `same` }))).sharedAdjustment, 0)
})
test('shared positive and negative residuals are learned conservatively and capped', () => {
  const positive = calibration(Array.from({ length: 12 }, (_, i) => row(i, 6)))
  const negative = calibration(Array.from({ length: 12 }, (_, i) => row(i, 1)))
  assert.ok(positive.sharedAdjustment > 0)
  assert.ok(negative.sharedAdjustment < 0)
  assert.ok(Math.abs(positive.sharedAdjustment) <= MAX_SHARED_ADJUSTMENT)
  assert.ok(Math.abs(negative.sharedAdjustment) <= MAX_SHARED_ADJUSTMENT)
  assert.equal(positive.finalScore, positive.bootstrapScore + positive.sharedAdjustment)
})
test('stale and dissimilar experiences do not qualify', () => {
  const stale = Array.from({ length: 12 }, (_, i) => row(i, 6, 'shared', { logged_at: '2010-01-01T00:00:00Z' }))
  const poor = Array.from({ length: 12 }, (_, i) => row(i, 6, 'shared', { wave_height_m: 5, wave_period_s: 3, wave_dir_from_deg: 90 }))
  assert.equal(calibration(stale).sharedAdjustment, 0)
  assert.equal(calibration(poor).sharedAdjustment, 0)
})
test('personal calibration requires three rows and combines after shared without double counting', () => {
  const shared = Array.from({ length: 12 }, (_, i) => row(i, 6, 'shared'))
  const insufficient = calibration([...shared, row(20, 1, 'personal'), row(21, 1, 'personal')])
  const combined = calibration([...shared, row(20, 1, 'personal'), row(21, 1, 'personal'), row(22, 1, 'personal')])
  assert.equal(insufficient.personalAdjustment, 0)
  assert.ok(combined.personalAdjustment < 0)
  assert.ok(Math.abs(combined.personalAdjustment) <= MAX_PERSONAL_ADJUSTMENT)
  assert.equal(combined.sharedSampleCount, 12)
  assert.equal(combined.personalSampleCount, 3)
  assert.equal(combined.source, 'shared_and_personal')
})
test('personal residuals use shared calibration for each historical condition', () => {
  const typeB = { wave_height_m: 1, wave_period_s: 9, wave_dir_from_deg: 250, wind_speed_ms: 5, wind_dir_from_deg: 140 }
  const sharedA = Array.from({ length: 12 }, (_, i) => row(i, 6, 'shared', { user_id: `a${i % 4}` }))
  const sharedB = Array.from({ length: 20 }, (_, i) => row(20 + i, 4, 'shared', { ...typeB, user_id: `b${i % 4}` }))
  const personalB = Array.from({ length: 4 }, (_, i) => row(40 + i, 4, 'personal', { ...typeB, user_id: 'current-user' }))
  const allShared = [...sharedA, ...sharedB]
  const atA = calibration(allShared)
  const atB = scoreSurf({ spotKey: 'Bore', swellHeightM: 1, swellPeriodS: 9, swellDirDeg: 250, windSpeedMs: 5, windDirDeg: 140, userExperiences: allShared }).breakdown.calibration
  const personalizedAtA = calibration([...allShared, ...personalB])
  assert.ok(atA.sharedAdjustment > 0.4)
  assert.ok(atB.sharedAdjustment < 0)
  // Type B sessions agree with type B's shared expectation. They must not inherit type A's
  // current-condition shared offset and be misclassified as a large negative personal bias.
  assert.ok(personalizedAtA.personalAdjustment > -0.3)
})
test('request-scoped preparation preserves outputs and bounds historical replay work', () => {
  const stableTime = '2099-01-01T00:00:00Z'
  const pool = [
    ...Array.from({ length: 12 }, (_, i) => row(100 + i, 6, 'shared', { logged_at: stableTime, user_id: `cache-user-${i % 4}` })),
    ...Array.from({ length: 4 }, (_, i) => row(200 + i, 5, 'personal', { logged_at: stableTime, user_id: 'cache-owner' })),
  ]
  resetSurfCalibrationCacheStats()
  const preparedFresh = scoreSurf({ ...current, userExperiences: pool }).breakdown.calibration
  const afterPreparation = getSurfCalibrationCacheStats()
  const preparedCached = scoreSurf({ ...current, userExperiences: pool }).breakdown.calibration
  const afterCachedScore = getSurfCalibrationCacheStats()
  assert.deepEqual(preparedCached, preparedFresh)
  assert.equal(afterPreparation.personalSharedComputations, 4)
  assert.deepEqual(afterCachedScore, afterPreparation)
  assert.ok(afterPreparation.bootstrapReplays <= pool.length)
})
test('legacy and multi-swell signatures are replayable', () => {
  const records = Array.from({ length: 8 }, (_, i) => row(i, 6, 'shared', i % 2 ? {} : { condition_signature: JSON.stringify({ spotKey: 'Bore', swells: [{ index: 1, height_m: 1.2, period_s: 10, direction_deg_from: 280 }, { index: 2, height_m: .4, period_s: 7, direction_deg_from: 250 }], wind_speed_ms: 3, wind_direction_deg_from: 100 }), selected_swell_index: 1 }))
  assert.equal(calibration(records).sharedSampleCount, 8)
})
test('anonymous/base-only path is unchanged', () => {
  const base = scoreSurf(current)
  assert.equal(base.breakdown.calibration, undefined)
  assert.ok(Number.isFinite(base.rating))
})


test('leave-one-out replay learns a genuine shared bias and improves MAE', () => {
  const fixture = Array.from({ length: 20 }, (_, i) => row(i, 6, 'shared', { user_id: `surfer${i % 5}` }))
  let baseError = 0, sharedError = 0
  for (let i = 0; i < fixture.length; i++) {
    const held = fixture[i]
    const pool = fixture.filter((_, j) => j !== i)
    const sharedPool = pool.filter((x) => x.user_id !== held.user_id).map((x) => ({ ...x, calibration_scope: 'shared' }))
    const base = scoreSurf(current).breakdown.scoring_breakdown.finalScoreFloat
    const sharedResult = scoreSurf({ ...current, userExperiences: sharedPool }).breakdown.calibration
    baseError += Math.abs(base - held.rating_1_6)
    sharedError += Math.abs(sharedResult.finalScore - held.rating_1_6)
  }
  const metrics = { samples: fixture.length, baseMae: baseError / fixture.length, sharedMae: sharedError / fixture.length }
  console.log('surf calibration leave-one-out metrics', metrics)
  assert.ok(metrics.sharedMae < metrics.baseMae)
})

test('leave-one-out no-signal fixture is confidence-shrunk without material degradation', () => {
  const fixture = Array.from({ length: 20 }, (_, i) => row(i, i % 2 ? 5 : 6, 'shared', { user_id: `surfer${i % 5}` }))
  let baseError = 0, sharedError = 0
  for (let i = 0; i < fixture.length; i++) {
    const held = fixture[i]
    const pool = fixture.filter((_, j) => j !== i && fixture[j].user_id !== held.user_id).map((x) => ({ ...x, calibration_scope: 'shared' }))
    const base = scoreSurf(current).breakdown.scoring_breakdown.finalScoreFloat
    const sharedResult = scoreSurf({ ...current, userExperiences: pool }).breakdown.calibration
    baseError += Math.abs(base - held.rating_1_6)
    sharedError += Math.abs(sharedResult.finalScore - held.rating_1_6)
  }
  const metrics = { samples: fixture.length, baseMae: baseError / fixture.length, sharedMae: sharedError / fixture.length }
  console.log('surf calibration no-signal leave-one-out metrics', metrics)
  assert.ok(metrics.sharedMae <= metrics.baseMae + 0.1)
})
