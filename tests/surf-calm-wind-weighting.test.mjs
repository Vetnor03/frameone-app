import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { applyCalmWindDirectionWeighting, windDirectionWeightMultiplierForSpeed } from '../app/lib/surf/calmWind.ts'

const rawBadDirectionScore = 1
test('bad wind direction at 0 m/s only contributes with the calm-wind multiplier', () => {
  const weighted = applyCalmWindDirectionWeighting(rawBadDirectionScore, 0)

  assert.equal(weighted.wind_direction_weight_multiplier, 0.25)
  assert.equal(weighted.raw_wind_direction_score, rawBadDirectionScore)
  assert.equal(weighted.effective_wind_direction_score, 0.25)
  assert.equal(weighted.calm_wind_weighting_applied, true)
})

test('bad wind direction at 1.5 m/s only lightly penalizes the effective wind direction score', () => {
  const weighted = applyCalmWindDirectionWeighting(rawBadDirectionScore, 1.5)

  assert.equal(weighted.wind_direction_weight_multiplier, 0.25)
  assert.equal(weighted.effective_wind_direction_score, 0.25)
  assert.equal(weighted.effective_wind_direction_score, rawBadDirectionScore * weighted.wind_direction_weight_multiplier)
})

test('bad wind direction at 2.5 m/s moderately penalizes the effective wind direction score', () => {
  const weighted = applyCalmWindDirectionWeighting(rawBadDirectionScore, 2.5)

  assert.equal(weighted.wind_direction_weight_multiplier, 0.6)
  assert.equal(weighted.effective_wind_direction_score, 0.6)
  assert.equal(weighted.effective_wind_direction_score, rawBadDirectionScore * weighted.wind_direction_weight_multiplier)
})

test('bad wind direction at 4+ m/s behaves exactly like the raw direction table score', () => {
  const weighted = applyCalmWindDirectionWeighting(rawBadDirectionScore, 4)

  assert.equal(weighted.wind_direction_weight_multiplier, 1)
  assert.equal(weighted.effective_wind_direction_score, rawBadDirectionScore)
  assert.equal(weighted.calm_wind_weighting_applied, false)
})

test('wind speed multiplier boundaries follow the calm wind scoring rule', () => {
  assert.equal(windDirectionWeightMultiplierForSpeed(0.999), 0.25)
  assert.equal(windDirectionWeightMultiplierForSpeed(1), 0.25)
  assert.equal(windDirectionWeightMultiplierForSpeed(1.999), 0.25)
  assert.equal(windDirectionWeightMultiplierForSpeed(2), 0.6)
  assert.equal(windDirectionWeightMultiplierForSpeed(2.999), 0.6)
  assert.equal(windDirectionWeightMultiplierForSpeed(3), 1)
})

test('app forecast and physical frame scoring flow through the shared surf scoring helper', () => {
  const scoringHelper = readFileSync(new URL('../app/lib/surfScoring.ts', import.meta.url), 'utf8')
  const surfRoute = readFileSync(new URL('../app/api/surf/score/route.ts', import.meta.url), 'utf8')
  const mirrorSnapshotRoute = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')

  assert.match(scoringHelper, /import \{ applyCalmWindDirectionWeighting \} from '\.\/surf\/calmWind'/)
  assert.match(scoringHelper, /sWindDir\.score \* windDirectionEffectiveWeight/)
  assert.match(surfRoute, /import \{ scoreSurf,/)
  assert.match(surfRoute, /function buildAppSurfForecast/)
  assert.match(surfRoute, /aggregation: 'exact_visible_slot_values'/)
  assert.match(surfRoute, /const OPEN_METEO_NORMAL_WIND_HOURLY_FIELDS = \[OPEN_METEO_NORMAL_WIND_SPEED_FIELD, OPEN_METEO_NORMAL_WIND_DIRECTION_FIELD\] as const/)
  assert.match(surfRoute, /hourly: \[\.\.\.OPEN_METEO_NORMAL_WIND_HOURLY_FIELDS\]/)
  assert.match(surfRoute, /raw_wind_uses_gusts: false/)
  assert.match(surfRoute, /scoring_breakdown: args\.scored\?\.breakdown\?\.scoring_breakdown/)
  assert.match(scoringHelper, /smoothedRangeScore/)
  assert.match(scoringHelper, /scoring_breakdown\?: SurfScoringBreakdown/)
  assert.doesNotMatch(surfRoute, /wind_gusts_10m|windgusts_10m/)
  assert.match(surfRoute, /function scoreRawSurfHourAtIdx[\s\S]*?pickBestSwell/)
  assert.match(surfRoute, /function appForecastDaypartBucket[\s\S]*?scoreRawSurfHourAtIdx/)
  assert.match(mirrorSnapshotRoute, /new URL\('\/api\/surf\/score', origin\)/)
  assert.match(mirrorSnapshotRoute, /url\.searchParams\.set\('frame', '1'\)/)
})
