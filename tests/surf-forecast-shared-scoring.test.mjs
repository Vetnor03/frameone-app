import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { surfRatingText, surfRatingValue1to6 } from '../app/lib/surf/ratings.ts'

const routeSource = readFileSync(new URL('../app/api/surf/score/route.ts', import.meta.url), 'utf8')

function functionBody(name) {
  const signature = `function ${name}`
  const start = routeSource.indexOf(signature)
  assert.notEqual(start, -1, `${name} exists`)

  const parenStart = routeSource.indexOf('(', start)
  assert.notEqual(parenStart, -1, `${name} has parameters`)

  let parenDepth = 0
  let braceStart = -1
  for (let i = parenStart; i < routeSource.length; i++) {
    const ch = routeSource[i]
    if (ch === '(') parenDepth++
    if (ch === ')') parenDepth--
    if (parenDepth === 0) {
      braceStart = routeSource.indexOf('{', i)
      break
    }
  }
  assert.notEqual(braceStart, -1, `${name} has a body`)

  let depth = 0
  for (let i = braceStart; i < routeSource.length; i++) {
    const ch = routeSource[i]
    if (ch === '{') depth++
    if (ch === '}') depth--
    if (depth === 0) return routeSource.slice(braceStart + 1, i)
  }

  assert.fail(`${name} body is balanced`)
}

test('Surf Forecast buckets use the same scoring path as surf cards and frame widgets', () => {
  const buildAppForecast = functionBody('buildAppSurfForecast')
  const averageDaypart = functionBody('averageAppForecastDaypart')
  const scoreBucket = functionBody('scoreSurfBucketAtIdx')
  const pickBest = functionBody('pickBestSwell')

  assert.match(buildAppForecast, /averageAppForecastDaypart\(/, 'app forecast is built from the shared daypart scorer')
  assert.match(averageDaypart, /scoreSurfBucketAtIdx\(/, 'app forecast dayparts evaluate hours through the shared scored bucket helper')
  assert.match(scoreBucket, /pickBestSwell\(/, 'scored buckets use the same primary/secondary swell picker')
  assert.match(scoreBucket, /picked\.chosenScore/, 'scored buckets return the score selected by the shared swell picker')
  assert.match(pickBest, /scoreSurf\(/, 'the swell picker scores candidate swells with the shared surf scoring helper')
  assert.match(pickBest, /betterByScoredThenHeight\(/, 'secondary swell selection compares shared scored candidates and corrected height')
})

test('Surf Forecast carries calm-wind direction weighting details from shared score breakdowns', () => {
  const averageDaypart = functionBody('averageAppForecastDaypart')

  assert.match(averageDaypart, /raw_wind_direction_score/, 'raw wind direction score is preserved')
  assert.match(averageDaypart, /effective_wind_direction_score/, 'calm-wind-adjusted wind direction score is preserved')
  assert.match(averageDaypart, /wind_direction_weight_multiplier/, 'calm-wind direction weight multiplier is preserved')
  assert.match(averageDaypart, /calm_wind_weighting_applied/, 'calm wind weighting flag is preserved')
})

test('shared surf rating labels and bar values normalize all UI surf ratings consistently', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(surfRatingText), [
    'Flat',
    'Poor',
    'Poor to Fair',
    'Fair',
    'Good',
    'Epic',
  ])
  assert.equal(surfRatingText(6.4), 'Epic')
  assert.equal(surfRatingText(0), '--')
  assert.equal(surfRatingValue1to6(3.49), 3)
  assert.equal(surfRatingValue1to6(6), 6)
  assert.equal(surfRatingValue1to6(7), undefined)
})
