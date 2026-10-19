import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { shouldShowTomorrowWeather, buildMediumWeatherDetail } from '../app/lib/weatherMirror.ts'
import { buildTomorrowWeatherSummary } from '../app/lib/weatherTomorrow.mjs'
import { physicalModuleDeadlines, physicalRenderManifest, physicalRenderProjection } from '../app/lib/device/contentSignatureBase.mjs'

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
  assert.match(mirror, /weatherTomorrowSummary: useTomorrow \\? shownTomorrowSummary : ''/)
  assert.match(mirror, /const shownTomorrowSummary = weekendSummary \\|\\| tomorrowSummary/)
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
  assert.match(small, /const char\* heading = useTomorrow \? "Tomorrow" : locationName;/)
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

const osloTimestamp = (hour, minute = 0, date = '2026-10-19', offset = '+02:00') =>
  new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`).getTime()
const weatherFixture = {
  current: { time: '2026-10-19T19:00', temperature_2m: 8, weather_code: 3 },
  daily: {
    time: ['2026-10-19', '2026-10-20', '2026-10-21'],
    temperature_2m_min: [5, 5, 5],
    temperature_2m_max: [11, 11, 11],
    wind_speed_10m_max: [4, 4, 4],
    precipitation_sum: [0, 0, 0],
    weather_code: [3, 3, 3],
  },
  hourly: { time: [] },
  tomorrow_insight: 'Cloudy, but mostly dry.',
}
const weatherSettings = (size = 'SMALL', extras = []) => ({
  cells: [{ module: 'weather:1', size, colSpan: size === 'SMALL' ? 4 : 2, rowSpan: size === 'SMALL' ? 1 : 2, slot: 1 }, ...extras],
  modules: { weather: [{ id: 1, label: 'Geilo', units: 'metric', showHiLo: true }] },
})
const weatherSources = { 'weather:1': weatherFixture }
const renderConfig = { module: { label: 'Geilo', units: 'metric', showHiLo: true } }

test('small Weather swaps location for Tomorrow at 20:00 even when all weather measurements match', () => {
  const cell = weatherSettings().cells[0]
  const before = physicalRenderProjection('weather:1', weatherFixture, cell, renderConfig, osloTimestamp(19, 59)).visible
  const after = physicalRenderProjection('weather:1', weatherFixture, cell, renderConfig, osloTimestamp(20)).visible
  assert.equal(before.displayDay, 'today')
  assert.equal(after.displayDay, 'tomorrow')
  assert.equal(before.location, 'Geilo')
  assert.equal(after.location, 'Tomorrow')
  assert.deepEqual(before.range, after.range)
  assert.deepEqual(before.wind, after.wind)
  assert.equal(before.precipitation, after.precipitation)
  const beforeHash = physicalRenderManifest({ settings: weatherSettings(), sources: weatherSources, now: osloTimestamp(19, 59) })[0]
  const afterHash = physicalRenderManifest({ settings: weatherSettings(), sources: weatherSources, now: osloTimestamp(20) })[0]
  assert.notEqual(beforeHash.render_hash, afterHash.render_hash)
  assert.notEqual(beforeHash.weather_stable_hash, afterHash.weather_stable_hash)
})

test('medium Weather also changes categorical display hash, even if temperatures do not', () => {
  const settings = weatherSettings('MEDIUM')
  const [before, after] = [osloTimestamp(19, 59), osloTimestamp(20)].map(now =>
    physicalRenderManifest({ settings, sources: weatherSources, now })[0])
  assert.notEqual(before.weather_stable_hash, after.weather_stable_hash)
  assert.notEqual(before.render_hash, after.render_hash)
})

test('Weather receives a hard 20:00 wake and a midnight return deadline', () => {
  const settings = weatherSettings()
  const start = physicalModuleDeadlines({ settings, sources: weatherSources, now: osloTimestamp(19, 45) })['weather:1']
  assert.ok(start.some(d => d.reason === 'weather_tomorrow' && d.type === 'hard' && d.at === osloTimestamp(20)))
  const after = physicalModuleDeadlines({ settings, sources: weatherSources, now: osloTimestamp(20, 1) })['weather:1']
  assert.ok(after.some(d => d.reason === 'weather_midnight' && d.type === 'hard' && d.at === osloTimestamp(0, 0, '2026-10-20')))
  const large = physicalModuleDeadlines({ settings: weatherSettings('LARGE'), sources: weatherSources, now: osloTimestamp(19, 45) })['weather:1']
  assert.equal(large.some(d => d.reason === 'weather_tomorrow'), false)
})

test('handover joins another real wake shortly after 20:00 but does not piggyback on News', () => {
  const early = osloTimestamp(19, 40)
  const groceries = { module: 'groceries', size: 'SMALL', colSpan: 4, rowSpan: 1, slot: 2 }
  const settings = weatherSettings('SMALL', [groceries])
  const withGroceries = physicalModuleDeadlines({ settings, sources: { ...weatherSources, groceries: { items: [] } }, now: early })
  assert.equal(withGroceries['weather:1'].find(d => d.reason === 'weather_tomorrow').at, osloTimestamp(20, 10))
  const withNews = physicalModuleDeadlines({
    settings: weatherSettings('SMALL', [{ module: 'news', size: 'SMALL', slot: 2 }]),
    sources: { ...weatherSources, news: {} }, now: osloTimestamp(19, 30),
  })
  assert.equal(withNews['weather:1'].find(d => d.reason === 'weather_tomorrow').at, osloTimestamp(20))
})

test('no 20:00 hard wake when tomorrow forecast is missing or the layout is multi-day', () => {
  const missing = { ...weatherFixture, tomorrow_insight: '' }
  const deadlines = physicalModuleDeadlines({ settings: weatherSettings(), sources: { 'weather:1': missing }, now: osloTimestamp(19) })
  assert.equal(deadlines['weather:1'].some(d => d.reason === 'weather_tomorrow'), false)
  const projection = physicalRenderProjection('weather:1', missing, weatherSettings().cells[0], renderConfig, osloTimestamp(21))
  assert.equal(projection.visible.displayDay, 'today')
})

test('small Weather physical and Mirror View use a single Tomorrow header with correct underline', () => {
  const fw = readFileSync(new URL('../frame/src/modules/ModuleWeather.cpp', import.meta.url), 'utf8')
  const small = fw.slice(fw.indexOf('static void renderSmall'), fw.indexOf('static void renderMedium'))
  assert.match(small, /const char\* heading = useTomorrow \? "Tomorrow" : locationName;/)
  assert.match(small, /measureText\(heading, FONT_B12, lx1, ly1, lw, lh\)/)
  assert.match(small, /drawTextCenteredAt\(c\.x \+ c\.w \/ 2, titleBaseline, heading, FONT_B12, ink\)/)
  assert.doesNotMatch(small, /drawTomorrowWeatherLabel\(c, ink\)/)
  const app = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const mirror = app.slice(app.indexOf("if (module === 'weather' && size === 'small'"), app.indexOf("if (module === 'weather' && size === 'large'"))
  assert.match(mirror, /detail\.weatherIsTomorrow \? \(language === 'no' \? 'I morgen' : 'Tomorrow'\) : locationName/)
  assert.doesNotMatch(mirror, /absolute top-\[/)
})
