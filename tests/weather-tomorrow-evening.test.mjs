import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { shouldShowTomorrowWeather, buildMediumWeatherDetail } from '../app/lib/weatherMirror.ts'

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

test('physical small and medium renderers use the same date guards and label', () => {
  const fw = readFileSync(new URL('../frame/src/modules/ModuleWeather.cpp', import.meta.url), 'utf8')
  assert.match(fw, /localNow\.tm_hour < 20/)
  assert.match(fw, /strcmp\(data\.days\[0\]\.dateYMD, todayYmd\)/)
  assert.match(fw, /strcmp\(data\.days\[1\]\.dateYMD, tomorrowYmd\)/)
  const small = fw.slice(fw.indexOf('static void renderSmall'), fw.indexOf('static void renderMedium'))
  const medium = fw.slice(fw.indexOf('static void renderMedium'), fw.indexOf('static void renderMiniDay'))
  for (const renderer of [small, medium]) {
    assert.match(renderer, /shouldShowTomorrowForecast\(data\)/)
    assert.match(renderer, /drawTomorrowWeatherLabel\(c, ink\)/)
  }
  assert.match(medium, /if \(!useTomorrow\) buildWeatherInsight\(insightStr/)
  assert.doesNotMatch(fw.slice(fw.indexOf('static void renderLargeXL')), /drawTomorrowWeatherLabel\(c, ink\)/)
})
