import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { TEAM_ID_MAP } from '../app/lib/soccer/teamIdMap.ts'

const soccerRoute = readFileSync(new URL('../app/api/soccer/frame/route.ts', import.meta.url), 'utf8')
const soccerFirmware = readFileSync(new URL('../frame/src/modules/ModuleSoccer.cpp', import.meta.url), 'utf8')
const frameFirmware = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')
const netClient = readFileSync(new URL('../frame/src/network/NetClient.cpp', import.meta.url), 'utf8')
const mirrorRoute = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
const weatherDetailsRoute = readFileSync(new URL('../app/api/weather/details/route.ts', import.meta.url), 'utf8')
const weatherMirror = readFileSync(new URL('../app/lib/weatherMirror.ts', import.meta.url), 'utf8')
const weatherForecast = readFileSync(new URL('../app/lib/server/weatherForecast.ts', import.meta.url), 'utf8')
const homeClient = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('/api/soccer/frame supports brann with a mapped numeric football-data team id', () => {
  assert.equal(typeof TEAM_ID_MAP.brann, 'number')
  assert.ok(Number.isFinite(TEAM_ID_MAP.brann))
  assert.match(soccerRoute, /teamKey = String\(rawTeamKey \|\| ''\)\.trim\(\)\.toLowerCase\(\)/)
  assert.match(soccerRoute, /teamId:parsed/)
  assert.match(soccerRoute, /response:payload/)
  assert.match(soccerRoute, /empty: !nextMatch && !prevMatch && !standing && table\.length === 0 && !topScorer/)
})

test('invalid soccer teamId returns clear 400 JSON instead of a generic 500', () => {
  assert.match(soccerRoute, /code: 'missing_team_id'/)
  assert.match(soccerRoute, /code: 'unsupported_team_id'/)
  assert.ok((soccerRoute.match(/, 400\)/g) || []).length >= 2)
  assert.doesNotMatch(soccerRoute, /status: 500/)
})

test('external soccer API failures are logged and returned as controlled 502 JSON', () => {
  assert.match(soccerRoute, /external-fetch:http-error/)
  assert.match(soccerRoute, /external-fetch:network-error/)
  assert.match(soccerRoute, /config:missing-api-key/)
  assert.match(soccerRoute, /code: 'external_soccer_api_failed'/)
  assert.match(soccerRoute, /debugReason/)
  assert.match(soccerRoute, /code: 'external_soccer_api_failed'[^]*502/)
})

test('soccer responses cache successful upstream data and expose a fixed body length', () => {
  assert.match(soccerRoute, /unstable_cache/)
  assert.match(soccerRoute, /\['soccer-football-data-v1'\]/)
  assert.match(soccerRoute, /revalidate: SOCCER_DATA_REVALIDATE_SECONDS/)
  assert.match(soccerRoute, /stale-while-revalidate=/)
  assert.match(soccerRoute, /'Vercel-CDN-Cache-Control': cacheControl/)
  assert.match(soccerRoute, /'Content-Length': String\(new TextEncoder\(\)\.encode\(body\)\.byteLength\)/)
  assert.match(soccerRoute, /return soccerJson\(payload, 200, true\)/)
})

test('physical Soccer fetches once before paged drawing and never from render', () => {
  const dashboardRender = frameFirmware.slice(
    frameFirmware.indexOf('static bool renderLoadedDashboard'),
    frameFirmware.indexOf('static uint64_t explicitTimingRevision')
  )
  const soccerRender = soccerFirmware.slice(
    soccerFirmware.indexOf('void render(const Cell& c'),
    soccerFirmware.indexOf('} // namespace ModuleSoccer')
  )

  assert.match(dashboardRender, /ModuleSoccer::preload\(String\(activeAssignments\[i\]\.module\)\)/)
  assert.ok(dashboardRender.indexOf('ModuleSoccer::preload') < dashboardRender.indexOf('ensureDisplay()'))
  assert.match(soccerFirmware, /g_fetchAttempted\[idx\]/)
  assert.doesNotMatch(soccerRender, /tick\(idx\)/)
})

test('ESP32 requests identity encoding and logs response allocation evidence', () => {
  assert.match(netClient, /http\.addHeader\("Accept-Encoding", "identity"\)/)
  assert.match(netClient, /body_bytes=%u content_length=%d/)
  assert.match(netClient, /NetClient empty body path=%s free_heap=%u max_alloc=%u/)
})

test('weather mirror endpoint times out Open-Meteo and returns safe JSON on failure', () => {
  assert.match(mirrorRoute, /WEATHER_FETCH_TIMEOUT_MS = 6500/)
  assert.match(mirrorRoute, /timeoutMs: WEATHER_FETCH_TIMEOUT_MS/)
  assert.match(mirrorRoute, /\[mirror-snapshot:weather\]/)
  assert.match(mirrorRoute, /Weather data is temporarily unavailable\./)
  assert.match(mirrorRoute, /weatherLowTemp: '--°'/)
  assert.match(mirrorRoute, /weatherDays: \[\]/)
})

test('weather mirror UI uses the shared loading label while waiting for live details', () => {
  assert.match(homeClient, /window\.setTimeout\(\(\) => controller\.abort\(\), 9000\)/)
  assert.match(homeClient, /\[mirror-snapshot:client-load-failed\]/)
  assert.match(homeClient, /module !== 'date' && module !== 'soccer'/)
  assert.match(homeClient, /moduleLoadingText\(language, module\)/)
  assert.match(homeClient, /No live weather data/)
  assert.match(homeClient, /weatherLowTemp: '--°'/)
})

test('weather mirror keeps mostly-dry icons for short precipitation windows', () => {
  assert.match(mirrorRoute, /const totalCount = counts\.reduce/)
  assert.match(mirrorRoute, /const precipCoverageThreshold = Math\.max\(3, Math\.ceil\(totalCount \* 0\.35\)\)/)
  assert.match(mirrorRoute, /short late shower should still be\s*\/\/ mentioned in the text, but the icon should represent the mostly-dry day/s)
})

test('weather mirror omits insignificant advice and reclaims advice layout space', () => {
  assert.doesNotMatch(weatherMirror, /Comfortable weather today\./)
  assert.doesNotMatch(weatherMirror, /Sunny and calm all day\./)
  assert.doesNotMatch(weatherMirror, /Dry conditions throughout the day\./)
  assert.doesNotMatch(weatherMirror, /fallbackClothingAdvice/)
  assert.doesNotMatch(weatherMirror, /Big temperature swing today\./)
  assert.match(weatherMirror, /upcomingHours = minHour >= 0 \? hours\.filter\(\(h\) => h\.hour >= minHour\) : hours/)
  assert.match(weatherMirror, /return ''/)
  assert.match(homeClient, /const hasAdvice = advice\.trim\(\)\.length > 0/)
  assert.match(homeClient, /hasAdvice \? 'max-w-\[34%\]' : 'max-w-\[48%\]'/)
})

test('weather details precipitation debug logging has been removed', () => {
  assert.doesNotMatch(weatherDetailsRoute, /weather-precip-debug/)
  assert.doesNotMatch(weatherDetailsRoute, /rawPrecipitationValues/)
  assert.doesNotMatch(weatherDetailsRoute, /rawPrecipitationSum/)
  assert.doesNotMatch(weatherDetailsRoute, /logWeatherPrecipDebug/)
  assert.doesNotMatch(homeClient, /weather-precip-aggregation/)
})

test('weather details displays dry instead of probability for zero precipitation', () => {
  assert.match(homeClient, /if \(hasAmount && m === 0\) return 'Dry'/)
  assert.match(homeClient, /weatherDetailFormatPrecip\(period\.precipProbability, period\.precipMm\)/)
  assert.match(homeClient, /weatherDetailFormatPrecip\(data\.precipProbability, data\.precipMm\)/)
})

test('weather details metric bars scale against daily min and max ranges', () => {
  assert.match(weatherForecast, /'uv_index'/)
  assert.match(homeClient, /currentUvIndex: startIndex >= 0 \? weatherDetailArrayNumberAt\(hourlyPayload\.uv_index, startIndex\) : null/)
  assert.match(homeClient, /waterTempMinC = waterValues\.length \? Math\.min\(\.\.\.waterValues\) : null/)
  assert.match(homeClient, /waterTempMaxC = waterValues\.length \? Math\.max\(\.\.\.waterValues\) : null/)
  assert.match(homeClient, /\(\(n - minN\) \/ \(maxN - minN\)\) \* 100/)
  assert.match(homeClient, /WeatherDetailMetricBar value=\{data\.currentUvIndex\} min=\{0\} max=\{data\.uvIndex\}/)
  assert.match(homeClient, /weatherDetailUvLabel\(language, data\.currentUvIndex\)/)
  assert.match(homeClient, /WeatherDetailMetricBar value=\{data\.waterTempC\} min=\{data\.waterTempMinC\} max=\{data\.waterTempMaxC\}/)
  assert.match(homeClient, /weatherDetailWaterLabel\(language, data\.waterTempC\)/)
})

test('physical frame weather uses server-prepared cached payload instead of direct Open-Meteo', () => {
  const moduleWeather = readFileSync(new URL('../frame/src/modules/ModuleWeather.cpp', import.meta.url), 'utf8')
  assert.match(moduleWeather, /\/api\/weather\/details\?frame=1&compact=2&days=5&lat=/)
  assert.match(weatherDetailsRoute, /framePayload/)
  assert.match(weatherDetailsRoute, /return NextResponse\.json\(compactFrameWeatherPayload\(weather\.payload, frameCompactVersion, insight\)\)/)
  assert.doesNotMatch(moduleWeather, /api\.open-meteo\.com/)
  assert.doesNotMatch(moduleWeather, /marine-api\.open-meteo\.com/)
})
