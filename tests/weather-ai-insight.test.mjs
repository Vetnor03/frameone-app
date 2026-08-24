import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const insight = readFileSync(new URL('../app/lib/server/weatherInsight.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/weather/details/route.ts', import.meta.url), 'utf8')
const firmware = readFileSync(new URL('../frame/src/modules/ModuleWeather.cpp', import.meta.url), 'utf8')

test('weather insight keeps severe forecasts deterministic and AI fail-soft', () => {
  assert.match(insight, /severeInsight\(fallbackInput\)/)
  assert.ok(insight.indexOf('if (severe) return severe') < insight.indexOf("fetcher('https://api.openai.com/v1/responses'"))
  assert.match(insight, /return buildWeatherInsight\(fallbackInput\)/)
  assert.match(insight, /AI_TIMEOUT_MS/)
})

test('AI receives a compact time-aware forecast and may return no insight', () => {
  for (const field of ['localNow', 'temperatureC', 'feelsLikeC', 'precipitationProbability', 'precipitationMm', 'weatherCode', 'windMs', 'gustMs', 'sunrise', 'sunset']) assert.match(insight, new RegExp(field))
  assert.match(insight, /return one very short natural sentence.*exactly NONE/i)
  assert.match(insight, /raw < localNow/)
  assert.match(insight, /\.slice\(0, 10\)/)
})

test('AI results are cached and delivered to firmware without changing layout', () => {
  assert.match(insight, /CACHE_TTL_MS = 3 \* 60 \* 60 \* 1000/)
  assert.match(insight, /createHash\('sha256'\)/)
  assert.match(route, /resolveWeatherInsight\(weather\.payload\)/)
  assert.match(firmware, /char aiInsight\[96\]/)
  assert.match(firmware, /if \(data\.aiInsight\[0\]\)/)
})
