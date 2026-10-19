import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { shouldShowTomorrowWeather, buildMediumWeatherDetail } from '../app/lib/weatherMirror.ts'
import { buildTomorrowWeatherSummary } from '../app/lib/weatherTomorrow.mjs'

const today = '2026-10-19'
const tomorrow = '2026-10-20'
const days = [today, tomorrow, '2026-10-21']
const time = (hhmm, date = today) => new Date(`${date}T${hhmm}:00+02:00`)

test('compact weather changes to tomorrow at 20:00 in Europe/Oslo', () => {
  assert.equal(shouldShowTomorrowWeather(days, time('19:59')), false)
  assert.equal(shouldShowTomorrowWeather(days, time('20:00')), true)
  assert.equal(shouldShowTomorrowWeather(days, time('23:59')), true)
  assert.equal(shouldShowTomorrowWeather(['2026-10-20', '2026-10-21'], time('00:01', tomorrow)), false)
})

test('do not label stale or incomplete forecast as tomorrow', () => {
  assert.equal(shouldShowTomorrowWeather([today], time('20:15')), false)
  assert.equal(shouldShowTomorrowWeather(['2026-10-18', today], time('20:15')), false)
  assert.equal(shouldShowTomorrowWeather([today, '2026-10-22'], time('20:15')), false)
  assert.equal(shouldShowTomorrowWeather(days, time('20:15'), 'Invalid/Timezone'), false)
})

test('forecast handover respects local daylight-saving offset', () => {
  assert.equal(shouldShowTomorrowWeather(['2026-10-25', '2026-10-26'], new Date('2026-10-25T18:59:00Z')), false)
  assert.equal(shouldShowTomorrowWeather(['2026-10-25', '2026-10-26'], new Date('2026-10-25T19:00:00Z')), true)
  assert.equal(shouldShowTomorrowWeather(['2026-10-24', '2026-10-25'], new Date('2026-10-24T18:00:00Z')), true)
})

test('tomorrow detail uses next-day min, max, wind, precipitation and icon', () => {
  const next = buildMediumWeatherDetail({
    units: 'metric', showHiLo: true, currentTempC: 8,
    hiC: 13, loC: 4, windMaxMs: 9, precipMm: 5, wmo: 61,
    restValid: false, todayHours: [],
  })
  assert.equal(next.weatherLowTemp, '4°C')
  assert.equal(next.weatherHighTemp, '13°C')
  assert.equal(next.weatherWindLine, 'Wind up to 9 m/s')
  assert.equal(next.weatherPrecipLine, 'Rain: 5mm')
  assert.equal(next.weatherWmo, 61)
  assert.equal(next.weatherAdvice, '')
})

test('tomorrow summary covers the full next day and prioritizes hazardous conditions', () => {
  const weather = (codes, precipitation, wind, hourlyRows) => ({
    daily: {
      time: [today, tomorrow],
      weather_code: [1, codes],
      precipitation_sum: [0, precipitation],
      wind_speed_10m_max: [2, wind],
    },
    hourly: {
      time: hourlyRows.map(r => `${tomorrow}T${r[0]}:00`),
      weather_code: hourlyRows.map(r => r[1]),
      precipitation: hourlyRows.map(r => r[2]),
    },
  })
  assert.equal(
    buildTomorrowWeatherSummary(weather(63, 14, 12, [['08', 1, 0], ['15', 65, 3]])),
    'Heavy rain expected in the afternoon. Strong winds up to 12 m/s.',
  )
  assert.equal(
    buildTomorrowWeatherSummary(weather(95, 6, 4, [['17', 95, 1]])),
    'Thunderstorms possible in the evening.',
  )
  assert.equal(
    buildTomorrowWeatherSummary(weather(73, 7, 4, [['09', 73, 1]])),
    'Snow expected in the morning.',
  )
  assert.equal(
    buildTomorrowWeatherSummary(weather(2, 0, 4, [])),
    'Partly cloudy and mostly dry.',
  )
  assert.equal(
    buildTomorrowWeatherSummary(weather(3, 0, 17, [])),
    'Very strong winds up to 17 m/s.',
  )
  assert.ok(buildTomorrowWeatherSummary(weather(3, 0, 5, [])).length > 0)
  assert.ok(buildTomorrowWeatherSummary(weather(95, 10, 17, [])).length <= 88)
})

test('backend computes tomorrow summary before compacting the hourly forecast', () => {
  const route = readFileSync(new URL('../app/api/weather/details/route.ts', import.meta.url), 'utf8')
  assert.match(route, /buildTomorrowWeatherSummary\(weather\.payload\)/)
  assert.match(route, /tomorrow_insight: tomorrowInsight/)
  assert.match(route, /compactFrameWeatherPayload\(weather\.payload, frameCompactVersion, insight, tomorrowInsight\)/)
  const mirror = readFileSync(new URL('../app/api/device/mirror-snapshot/base.ts', import.meta.url), 'utf8')
  assert.match(mirror, /weatherTomorrowSummary: useTomorrow \? tomorrowSummary : ''/)
  assert.match(mirror, /const tomorrowSummary = buildTomorrowWeatherSummary\(data\)/)
})

test('physical small weather retains its label; medium weather uses approved evening layout', () => {
  const fw = readFileSync(new URL('../frame/src/modules/ModuleWeather.cpp', import.meta.url), 'utf8')
  assert.match(fw, /localNow\.tm_hour < 20/)
  assert.match(fw, /strcmp\(data\.days\[0\]\.dateYMD, todayYmd\)/)
  assert.match(fw, /strcmp\(data\.days\[1\]\.dateYMD, tomorrowYmd\)/)
  assert.match(fw, /filter\["tomorrow_insight"\] = true/)
  assert.match(fw, /out\.tomorrowInsight/)
  const small = fw.slice(fw.indexOf('static void renderSmall'), fw.indexOf('static void renderMedium'))
  const medium = fw.slice(fw.indexOf('static void renderMedium'), fw.indexOf('static void renderMiniDay'))
  assert.match(small, /shouldShowTomorrowForecast\(data\)/)
  assert.match(small, /drawTomorrowWeatherLabel\(c, ink\)/)
  assert.match(medium, /shouldShowTomorrowForecast\(data\)/)
  assert.doesNotMatch(medium, /drawTomorrowWeatherLabel\(c, ink\)/)
  assert.match(medium, /drawTextCenteredAt\(c\.x \+ c\.w \/ 2, tempBaseline, "Tomorrow", FONT_B12, ink\)/)
  assert.match(medium, /if \(useTomorrow\)[\s\S]*?int movedBaseline = insightTop/)
  assert.match(medium, /if \(useTomorrow\)[\s\S]*?data\.tomorrowInsight, FONT_B9, ink/)
  assert.match(medium, /if \(!useTomorrow\) buildWeatherInsight\(insightStr/)
  assert.doesNotMatch(fw.slice(fw.indexOf('static void renderLargeXL')), /drawTomorrowWeatherLabel\(c, ink\)/)
})

test('medium Mirror View preserves daytime and uses 2-line tomorrow Good to know at bottom', () => {
  const app = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const medium = app.slice(app.indexOf("if (module === 'weather' && size === 'medium'"), app.indexOf("if (module === 'date' && size === 'large'"))
  assert.match(medium, /const isTomorrow = detail\.weatherIsTomorrow === true/)
  assert.match(medium, /const advice = !isTomorrow \? detail\.weatherAdvice/)
  assert.match(medium, /I morgen/)
  assert.match(medium, /detail\.weatherLowTemp/)
  assert.match(medium, /detail\.weatherHighTemp/)
  assert.match(medium, /detail\.weatherTomorrowSummary/)
  assert.match(medium, /line-clamp-2 w-full/)
  assert.doesNotMatch(medium, /absolute top-\[/)
})
