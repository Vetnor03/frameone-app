import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'

register('./typescript-test-loader.mjs', import.meta.url)

const { pickBestSwell } = await import('../app/lib/surf/swellSelection.ts')
const { scoreSurf } = await import('../app/lib/surfScoring.ts')

const cases = {
  excellent: [[1.8, 12, 280], [0.2, 6, 90], 2, 90, ['primary', 5, 5]],
  mediocre: [[1, 8, 260], [0.1, 5, 100], 5, 180, ['primary', 4, 4]],
  poor: [[0.6, 5, 90], [0.1, 3, 260], 12, 270, ['primary', 1, 1]],
  nearFlat: [[0.2, 3, 270], [0.1, 2, 270], 1, 0, ['primary', 1, 1]],
  strongSwell: [[2.5, 14, 280], [0.5, 8, 100], 4, 100, ['primary', 5, 5]],
  weakPeriod: [[1.5, 4, 280], [0.1, 3, 100], 4, 100, ['primary', 3, 3]],
  badDirection: [[1.5, 11, 90], [0.1, 3, 100], 3, 100, ['primary', 1, 1]],
  offshoreWind: [[1.4, 10, 280], [0.1, 3, 100], 4, 100, ['primary', 5, 5]],
  strongBadWind: [[1.4, 10, 280], [0.1, 3, 100], 15, 280, ['primary', 3, 3]],
  secondarySelected: [[0.25, 3, 90], [1.2, 10, 280], 3, 100, ['secondary', 5, 4]],
}

test('production swell selection and scoring retain golden outputs', () => {
  for (const [name, [primary, secondary, windSpeed, windDirection, expected]] of Object.entries(cases)) {
    const marine = {
      time_utc: '2026-08-19T10:00',
      primary: { present: true, height_m: primary[0], period_s: primary[1], direction_deg_from: primary[2] },
      secondary: { present: secondary[0] >= 0.05, height_m: secondary[0], period_s: secondary[1], direction_deg_from: secondary[2] },
      wind_speed_ms: windSpeed,
      wind_direction_deg_from: windDirection,
    }
    const selected = pickBestSwell({ spotKey: 'Bore', marine })
    const breakdown = selected.chosenScore.breakdown

    assert.equal(selected.chosen, expected[0], `${name}: selected swell`)
    assert.equal(breakdown.modelRating, expected[1], `${name}: deterministic rating`)
    assert.equal(breakdown.finalRating, expected[2], `${name}: final rating`)
    assert.equal(selected.chosenScore.rating, expected[2], `${name}: public rating`)
    assert.ok(Number.isFinite(breakdown.scoring_breakdown.height.smoothedScore), `${name}: height component`)
    assert.ok(Number.isFinite(breakdown.scoring_breakdown.period.smoothedScore), `${name}: period component`)
    assert.ok(Number.isFinite(breakdown.scoring_breakdown.swellDirection.smoothedScore), `${name}: direction component`)
    assert.ok(Number.isFinite(breakdown.scoring_breakdown.windSpeed.smoothedScore), `${name}: wind speed component`)
    assert.ok(Number.isFinite(breakdown.scoring_breakdown.windDirection.smoothedScore), `${name}: wind direction component`)
    assert.equal(breakdown.finalScore, breakdown.finalRating, `${name}: canonical final score`)
  }
})

test('production experience matcher accepts rich and legacy records', () => {
  const common = { spotKey: 'Bore', swellHeightM: 1.2, swellPeriodS: 10, swellDirDeg: 280, windSpeedMs: 3, windDirDeg: 100 }
  const legacy = scoreSurf({ ...common, userExperiences: [{ wave_height_m: 1.2, wave_period_s: 10, wave_dir_from_deg: 280, wind_speed_ms: 3, wind_dir_from_deg: 100, rating_1_6: 6, logged_at: new Date().toISOString() }] })
  const rich = scoreSurf({ ...common, swells: [{ index: 1, height_m: 1.2, period_s: 10, direction_deg_from: 280 }, { index: 2, height_m: 0.5, period_s: 8, direction_deg_from: 260 }], userExperiences: [{ wave_height_m: 1.2, wave_period_s: 10, wave_dir_from_deg: 280, wind_speed_ms: 3, wind_dir_from_deg: 100, rating_1_6: 6, logged_at: new Date().toISOString(), condition_signature: { spotKey: 'Bore', swells: [{ index: 1, height_m: 1.2, period_s: 10, direction_deg_from: 280 }, { index: 2, height_m: 0.5, period_s: 8, direction_deg_from: 260 }], wind_speed_ms: 3, wind_direction_deg_from: 100 } }] })

  assert.ok(legacy.breakdown.experience.used_records > 0)
  assert.equal(legacy.breakdown.experience.match_type, 'legacy_single_swell')
  assert.ok(rich.breakdown.experience.used_records > 0)
  assert.equal(rich.breakdown.experience.match_type, 'combined')
})
