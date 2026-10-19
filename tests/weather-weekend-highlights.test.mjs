import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildWeekendWeatherHighlight } from '../app/lib/weatherWeekend.mjs'

const weather = () => ({
  timezone: 'Europe/Oslo',
  current: { time: '2026-10-22T18:00', temperature_2m: 10 },
  daily: {
    time: ['2026-10-22','2026-10-23','2026-10-24','2026-10-25','2026-10-26'],
    temperature_2m_max: [10, 11, 14, 13, 11],
    temperature_2m_min: [7, 6, 8, 7, 5],
    weather_code: [3, 3, 1, 2, 3],
    precipitation_sum: [1, 0.6, 0.1, 0.1, 2],
    wind_speed_10m_max: [6, 7, 5, 5, 6],
  },
  hourly: {
    time: ['2026-10-22T18:00','2026-10-22T20:00'],
    weather_code: [3, 3],
    precipitation: [0, 0],
    wind_speed_10m: [5, 5],
  },
})
const highlightAt = (forecast, localIso) =>
  buildWeekendWeatherHighlight(forecast, { now: new Date(localIso).getTime() })

test('Weather highlights a genuinely dry and bright weekend from Thursday evening', () => {
  const value = highlightAt(weather(), '2026-10-22T18:30:00+02:00')
  assert.equal(value, 'Weekend looks bright and mostly dry, with highs up to 14°C.')
  assert.ok(value.length < 95)
  assert.equal(highlightAt(weather(), '2026-10-22T17:59:00+02:00'), '')
  assert.equal(highlightAt(weather(), '2026-10-23T20:30:00+02:00'), value)
  assert.equal(highlightAt(weather(), '2026-10-24T09:00:00+02:00'), '')
})

test('one good weekend day identifies Saturday or Sunday without praising the whole weekend', () => {
  const forecast = weather()
  forecast.daily.weather_code[3] = 61
  forecast.daily.precipitation_sum[3] = 9
  assert.equal(highlightAt(forecast, '2026-10-22T19:30:00+02:00'),
    'Saturday looks sunny and mostly dry, around 14°C.')
  forecast.daily.weather_code[2] = 61
  forecast.daily.precipitation_sum[2] = 8
  forecast.daily.weather_code[3] = 0
  forecast.daily.precipitation_sum[3] = 0
  assert.equal(highlightAt(forecast, '2026-10-22T19:30:00+02:00'),
    'Sunday looks sunny and mostly dry, around 13°C.')
})

test('unremarkable or wet weekends, missing Sunday and strong winds produce no hype', () => {
  const wet = weather()
  wet.daily.precipitation_sum[2] = 8
  wet.daily.precipitation_sum[3] = 8
  assert.equal(highlightAt(wet, '2026-10-22T19:00:00+02:00'), '')
  const incomplete = weather()
  for (const key of Object.keys(incomplete.daily)) incomplete.daily[key].splice(3,1)
  assert.equal(highlightAt(incomplete, '2026-10-22T19:00:00+02:00'), '')
  const windy = weather()
  windy.daily.wind_speed_10m_max[2] = 12
  windy.daily.wind_speed_10m_max[3] = 13
  assert.equal(highlightAt(windy, '2026-10-22T19:00:00+02:00'), '')
})

test('significant rain now or hazardous tomorrow takes priority over a pleasant weekend', () => {
  const warning = weather()
  warning.hourly.precipitation[1] = 3
  assert.equal(highlightAt(warning, '2026-10-22T19:00:00+02:00'), '')
  const tomorrowStorm = weather()
  tomorrowStorm.daily.weather_code[1] = 95
  assert.equal(highlightAt(tomorrowStorm, '2026-10-22T19:00:00+02:00'), '')
})

test('DST weekend local time and stale/nonexistent data never cause false highlights', () => {
  const forecast = weather()
  assert.equal(highlightAt(forecast, '2026-10-22T18:00:00+02:00').startsWith('Weekend'), true)
  assert.equal(highlightAt(forecast, '2026-10-25T18:00:00+01:00'), '')
  assert.equal(buildWeekendWeatherHighlight({ daily: {} }, { now: Date.parse('2026-10-22T20:00:00+02:00') }), '')
})

test('exclusive Weather-only ownership: frame and Mirror View use identical rule; Reminders stays untouched', () => {
  const weatherApi = readFileSync(new URL('../app/api/weather/details/route.ts', import.meta.url), 'utf8')
  const mirror = readFileSync(new URL('../app/api/device/mirror-snapshot/base.ts', import.meta.url), 'utf8')
  const reminders = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  const insight = readFileSync(new URL('../app/lib/reminderComingUp.mjs', import.meta.url), 'utf8')
  assert.match(weatherApi, /const weekend = buildWeekendWeatherHighlight\(weather\.payload\)/)
  assert.match(weatherApi, /const insight = weekend \|\| await resolveWeatherInsight/)
  assert.match(weatherApi, /const tomorrowInsight = weekend \|\| buildTomorrowWeatherSummary/)
  assert.match(mirror, /const weekendSummary = buildWeekendWeatherHighlight\(data\)/)
  assert.ok(mirror.includes('const tomorrowSummary = buildTomorrowWeatherSummary(data)'))
  assert.ok(mirror.includes('const shownTomorrowSummary = weekendSummary || tomorrowSummary'))
  assert.match(mirror, /medium\.weatherAdvice = useTomorrow \? '' : weekendSummary \|\| await resolveWeatherInsight/)
  assert.doesNotMatch(reminders, /WeekendWeatherHighlight|weatherWeekend|weekend_insight/)
  assert.doesNotMatch(insight, /WeekendWeatherHighlight|weatherWeekend|weekend_insight/)
})
