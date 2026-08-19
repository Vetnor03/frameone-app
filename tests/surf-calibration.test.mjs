import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
register('./typescript-test-loader.mjs', import.meta.url)
const { scoreSurf, MAX_SHARED_ADJUSTMENT, MAX_PERSONAL_ADJUSTMENT } = await import('../app/lib/surfScoring.ts')

const current = { spotKey: 'Bore', swellHeightM: 1.2, swellPeriodS: 10, swellDirDeg: 280, windSpeedMs: 3, windDirDeg: 100 }
const now = new Date().toISOString()
function row(i, rating, scope = 'shared', overrides = {}) {
  return { id: `r${i}`, user_id: `u${i % 4}`, spot_id: 'bore', logged_at: now, wave_height_m: 1.2, wave_period_s: 10, wave_dir_from_deg: 280, wind_speed_ms: 3, wind_dir_from_deg: 100, rating_1_6: rating, calibration_scope: scope, ...overrides }
}
function calibration(records) { return scoreSurf({ ...current, userExperiences: records }).breakdown.calibration }

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
})
test('stale and dissimilar experiences do not qualify', () => {
  const stale = Array.from({ length: 12 }, (_, i) => row(i, 6, 'shared', { logged_at: '2010-01-01T00:00:00Z' }))
  const poor = Array.from({ length: 12 }, (_, i) => row(i, 6, 'shared', { wave_height_m: 5, wave_period_s: 3, wave_dir_from_deg: 90 }))
  assert.equal(calibration(stale).sharedAdjustment, 0)
  assert.equal(calibration(poor).sharedAdjustment, 0)
})
test('personal calibration requires three rows and combines after shared without double counting', () => {
  const shared = Array.from({ length: 12 }, (_, i) => row(i, 5, 'shared'))
  const insufficient = calibration([...shared, row(20, 1, 'personal'), row(21, 1, 'personal')])
  const combined = calibration([...shared, row(20, 1, 'personal'), row(21, 1, 'personal'), row(22, 1, 'personal')])
  assert.equal(insufficient.personalAdjustment, 0)
  assert.ok(combined.personalAdjustment < 0)
  assert.ok(Math.abs(combined.personalAdjustment) <= MAX_PERSONAL_ADJUSTMENT)
  assert.equal(combined.sharedSampleCount, 12)
  assert.equal(combined.personalSampleCount, 3)
  assert.equal(combined.source, 'shared_and_personal')
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


test('leave-one-out replay backtest does not materially worsen aggregate error', () => {
  const fixture = Array.from({ length: 20 }, (_, i) => row(i, (i % 5 === 1 || i % 5 === 3) ? 5 : 6, 'shared', { user_id: `surfer${i % 5}` }))
  let baseError = 0, sharedError = 0, combinedError = 0
  for (let i = 0; i < fixture.length; i++) {
    const held = fixture[i]
    const pool = fixture.filter((_, j) => j !== i)
    const sharedPool = pool.filter((x) => x.user_id !== held.user_id).map((x) => ({ ...x, calibration_scope: 'shared' }))
    const personalPool = pool.filter((x) => x.user_id === held.user_id).map((x) => ({ ...x, calibration_scope: 'personal' }))
    const base = scoreSurf(current).breakdown.scoring_breakdown.finalScoreFloat
    const sharedResult = scoreSurf({ ...current, userExperiences: sharedPool }).breakdown.calibration
    const combinedResult = scoreSurf({ ...current, userExperiences: [...sharedPool, ...personalPool] }).breakdown.calibration
    baseError += Math.abs(base - held.rating_1_6)
    sharedError += Math.abs(sharedResult.finalScore - held.rating_1_6)
    combinedError += Math.abs(combinedResult.finalScore - held.rating_1_6)
  }
  const metrics = { samples: fixture.length, baseMae: baseError / fixture.length, sharedMae: sharedError / fixture.length, sharedPersonalMae: combinedError / fixture.length }
  console.log('surf calibration leave-one-out metrics', metrics)
  assert.ok(metrics.sharedMae <= metrics.baseMae + 0.1)
  assert.ok(metrics.sharedPersonalMae <= metrics.baseMae + 0.1)
})
