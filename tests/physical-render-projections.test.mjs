import assert from 'node:assert/strict'
import test from 'node:test'
import { buildContentRequestPlan, physicalModuleDeadlines, physicalRenderDigest, physicalRenderManifest, physicalRenderProjection } from '../app/lib/device/contentSignature.mjs'

const hash = (kind, value, cell = { w: 200, h: 120, colSpan: 1, rowSpan: 1 }, config = {}, now) =>
  physicalRenderDigest(kind, value, cell, { language: 'en', timeZone: 'Europe/Oslo', module: config }, now)

test('Weather hashes renderer-rounded temperature, condition icon, and only geometry-visible forecasts', () => {
  const weather = (temperature, code = 1) => ({ current: { temperature_2m: temperature, weather_code: code }, hourly: { temperature_2m: [1, 2] } })
  assert.equal(hash('weather:1', weather(12.2)), hash('weather:1', weather(12.3)))
  assert.notEqual(hash('weather:1', weather(12.2)), hash('weather:1', weather(13)))
  assert.notEqual(hash('weather:1', weather(12.2, 1)), hash('weather:1', weather(12.2, 63)))
  assert.equal(hash('weather:1', weather(12.2)), hash('weather:1', { ...weather(12.2), hourly: { temperature_2m: [99] } }))
})

test('Weather uses the matching hourly rain probability and converts units before rounding', () => {
  const cell = { w: 400, h: 240, colSpan: 2, rowSpan: 2, size: 'ADAPTIVE' }
  const weather = (probability, hidden = 99) => ({ current: { time: '2026-09-07T10:15', temperature_2m: 0.2, weather_code: 1 }, hourly: {
    time: ['2026-09-07T09:00', '2026-09-07T10:00', '2026-09-07T11:00'], precipitation_probability: [hidden, probability, hidden],
  } })
  assert.notEqual(hash('weather:1', weather(20), cell), hash('weather:1', weather(70), cell))
  assert.equal(hash('weather:1', weather(20, 10), cell), hash('weather:1', weather(20, 90), cell))
  assert.equal(hash('weather:1', weather(20), cell, { units: 'metric' }), hash('weather:1', { ...weather(20), current: { ...weather(20).current, temperature_2m: 0.3 } }, cell, { units: 'metric' }))
  assert.notEqual(hash('weather:1', weather(20), cell, { units: 'imperial' }), hash('weather:1', { ...weather(20), current: { ...weather(20).current, temperature_2m: 0.3 } }, cell, { units: 'imperial' }))
})

test('Weather legacy families project their renderer-specific state', () => {
  const small = { w: 800, h: 120, size: 'SMALL' }, medium = { w: 400, h: 240, size: 'MEDIUM' }, large = { w: 800, h: 240, size: 'LARGE' }, xl = { w: 800, h: 480, size: 'XL' }
  const source = { current: { temperature_2m: 12 }, rest_of_today: { temperature_2m_min: 8, temperature_2m_max: 14, wind_speed_10m_max: 3, precipitation_sum: 1, weather_code: 61 }, daily: { time: ['a', 'b', 'c', 'd'], temperature_2m_min: [8, 9, 10, 11], temperature_2m_max: [14, 15, 16, 17], weather_code: [1, 2, 3, 61], wind_speed_10m_max: [3, 4, 5, 6], precipitation_sum: [1, 2, 3, 4] }, hourly: { precipitation_probability: [10] } }
  assert.notEqual(hash('weather:1', source, small, { label: 'Oslo' }), hash('weather:1', { ...source, rest_of_today: { ...source.rest_of_today, wind_speed_10m_max: 5 } }, small, { label: 'Oslo' }))
  assert.notEqual(hash('weather:1', source, small, { label: 'Oslo' }), hash('weather:1', { ...source, rest_of_today: { ...source.rest_of_today, temperature_2m_max: 15 } }, small, { label: 'Oslo' }))
  assert.equal(hash('weather:1', source, small, { label: 'Oslo' }), hash('weather:1', { ...source, hourly: { precipitation_probability: [90] } }, small, { label: 'Oslo' }))
  assert.notEqual(hash('weather:1', source, small, { label: 'Oslo' }), hash('weather:1', source, small, { label: 'Bergen' }))
  assert.equal(hash('weather:1', source, medium, { label: 'Oslo' }), hash('weather:1', source, medium, { label: 'Bergen' }))
  assert.notEqual(hash('weather:1', source, large), hash('weather:1', { ...source, daily: { ...source.daily, weather_code: [1, 2, 3, 80] } }, large))
  assert.notEqual(hash('weather:1', source, xl), hash('weather:1', { ...source, current: { ...source.current, relative_humidity_2m: 70 } }, xl))
})

test('Weather LARGE and XL rebuild visible days and derived insight from hourly cache data', () => {
  const large = { w: 800, h: 240, size: 'LARGE' }, xl = { w: 800, h: 480, size: 'XL' }, medium = { w: 400, h: 240, size: 'MEDIUM' }
  const base = { current: { time: '2026-01-01T09:00', temperature_2m: 5, weather_code: 1 }, daily: { time: ['2026-01-01', '2026-01-02'], temperature_2m_min: [1, 1], temperature_2m_max: [9, 9], weather_code: [1, 1] }, hourly: { time: ['2026-01-01T09:00', '2026-01-02T10:00'], temperature_2m: [5, 5], wind_speed_10m: [2, 2], precipitation: [0, 0], weather_code: [1, 1] } }
  const changed = structuredClone(base); changed.hourly.temperature_2m[1] = 12
  assert.notEqual(hash('weather:1', base, large), hash('weather:1', changed, large)); assert.notEqual(hash('weather:1', base, xl), hash('weather:1', changed, xl))
  const morning = structuredClone(base); morning.hourly.time = ['2026-01-01T11:00']; morning.hourly.temperature_2m = [5]; morning.hourly.wind_speed_10m = [2]; morning.hourly.precipitation = [2]; morning.hourly.weather_code = [65]
  const afternoon = structuredClone(morning); afternoon.hourly.time[0] = '2026-01-01T15:00'
  assert.notEqual(hash('weather:1', morning, medium, {}, Date.parse('2026-01-01T08:00Z')), hash('weather:1', afternoon, medium, {}, Date.parse('2026-01-01T08:00Z')))
  assert.equal(hash('weather:1', { ...morning, insight: 'Server text' }, medium, {}, 0), hash('weather:1', { ...afternoon, insight: 'Server text' }, medium, {}, 0))
})

test('Weather derived-insight deadline is conditional on visible text changing', () => {
  const cell = { module: 'weather:1', w: 400, h: 240, size: 'MEDIUM' }, settings = { cells: [cell], modules: { weather: [{ id: 1 }] } }
  const now = Date.parse('2026-01-01T08:30:00Z')
  const source = { current: { time: '2026-01-01T09:00', temperature_2m: 5 }, hourly: { time: ['2026-01-01T10:00', '2026-01-01T15:00'], temperature_2m: [5, 5], wind_speed_10m: [1, 1], precipitation: [2, 2], weather_code: [65, 65] } }
  assert.ok(physicalModuleDeadlines({ settings, sources: { 'weather:1': source }, now })['weather:1'].some((d) => d.reason === 'weather_insight' && d.type === 'hard'))
  const supplied = { ...source, insight: 'Stable server text' }
  assert.ok(!physicalModuleDeadlines({ settings, sources: { 'weather:1': supplied }, now })['weather:1'].some((d) => d.reason === 'weather_insight'))
})

test('Adaptive Weather consumes reconstructed hourly cache and preserves wind threshold state', () => {
  const medium = { w: 400, h: 240, size: 'ADAPTIVE', colSpan: 2, rowSpan: 2 }
  const xl = { w: 800, h: 480, size: 'ADAPTIVE', colSpan: 4, rowSpan: 4 }
  const base = { current: { time: '2026-09-08T10:00', temperature_2m: 12, weather_code: 1, wind_speed_10m: .1 }, daily: {
    time: ['2026-09-08', '2026-09-09'], temperature_2m_min: [5, 6], temperature_2m_max: [15, 16], weather_code: [1, 1], precipitation_sum: [20, 20],
  }, hourly: { time: ['2026-09-08T10:00', '2026-09-08T11:00', '2026-09-09T10:00'], temperature_2m: [10, 14, 12], wind_speed_10m: [.1, .1, 1], precipitation: [0, 0, 0], weather_code: [1, 1, 1] } }
  const icon = structuredClone(base); icon.hourly.weather_code[0] = 63; icon.hourly.weather_code[1] = 63
  const range = structuredClone(base); range.hourly.temperature_2m[1] = 18
  const forecast = structuredClone(base); forecast.hourly.weather_code[2] = 63
  assert.notEqual(hash('weather:1', base, medium), hash('weather:1', icon, medium))
  assert.notEqual(hash('weather:1', base, medium), hash('weather:1', range, medium))
  assert.notEqual(hash('weather:1', base, xl), hash('weather:1', forecast, xl))
  const wind = (speed) => ({ ...base, current: { ...base.current, wind_speed_10m: speed }, hourly: { ...base.hourly, wind_speed_10m: [speed, speed, 1] } })
  assert.equal(hash('weather:1', wind(.1), medium), hash('weather:1', wind(.2), medium))
  assert.notEqual(hash('weather:1', wind(.1), medium), hash('weather:1', wind(.3), medium))
  assert.equal(hash('weather:1', wind(.3), medium), hash('weather:1', wind(.4), medium))
  assert.equal(physicalRenderProjection('weather:1', base, medium, { module: {} }).visible.today.temperature_2m_max, 14)
})

test('Compact-v2 Weather preserves daily fallback state for days without hourly rows', () => {
  const days = Array.from({ length: 5 }, (_, i) => `2026-09-${String(i + 8).padStart(2, '0')}`)
  const base = { current: { time: `${days[0]}T10:00`, temperature_2m: 12, weather_code: 1 }, daily: { time: days,
    temperature_2m_min: [8, 9, 10, 11, 12], temperature_2m_max: [14, 15, 16, 17, 18], weather_code: [1, 2, 3, 1, 2],
    wind_speed_10m_max: [2, .1, 3, 4, 5], precipitation_sum: [0, 4, 0, 0, 0] }, hourly: {
    time: [`${days[0]}T10:00`, `${days[0]}T11:00`], temperature_2m: [11, 14], wind_speed_10m: [2, 2], precipitation: [0, 0], weather_code: [1, 1],
  } }
  const large = { w: 800, h: 240, size: 'LARGE' }, xl = { w: 800, h: 480, size: 'XL' }
  const adaptive = { w: 800, h: 480, size: 'ADAPTIVE', colSpan: 4, rowSpan: 4 }, hidden = { w: 400, h: 240, size: 'ADAPTIVE', colSpan: 2, rowSpan: 2 }
  for (const field of ['weather_code', 'precipitation_sum']) {
    const changed = structuredClone(base); changed.daily[field][1] = field === 'weather_code' ? 63 : 8
    for (const cell of field === 'weather_code' ? [large, xl, adaptive] : [large, xl]) assert.notEqual(hash('weather:1', base, cell), hash('weather:1', changed, cell))
    if (field === 'precipitation_sum') assert.equal(hash('weather:1', base, adaptive), hash('weather:1', changed, adaptive))
  }
  const hiddenChange = structuredClone(base); hiddenChange.daily.weather_code[4] = 63
  assert.equal(hash('weather:1', base, hidden), hash('weather:1', hiddenChange, hidden))
  const wind = (speed) => { const value = structuredClone(base); value.daily.wind_speed_10m_max[1] = speed; return value }
  assert.equal(hash('weather:1', wind(.1), large), hash('weather:1', wind(.2), large))
  assert.notEqual(hash('weather:1', wind(.1), large), hash('weather:1', wind(.3), large))
  assert.equal(hash('weather:1', wind(.3), large), hash('weather:1', wind(.4), large))
  assert.equal(hash('weather:1', base, xl, { label: 'Oslo' }), hash('weather:1', base, xl, { label: 'Bergen' }))
  assert.notEqual(hash('weather:1', base, large, { label: 'Oslo' }), hash('weather:1', base, large, { label: 'Bergen' }))
})

test('Daily-only Weather retains renderer wind, precipitation and WMO thresholds', () => {
  const daily = (wind, precipitation = .1, code = 61) => ({ current: { temperature_2m: 4, weather_code: 1 }, daily: {
    time: ['2026-09-08', '2026-09-09'], temperature_2m_min: [3, 3], temperature_2m_max: [5, 5], weather_code: [code, code], wind_speed_10m_max: [wind, wind], precipitation_sum: [precipitation, precipitation],
  }, hourly: { time: [], temperature_2m: [], weather_code: [], wind_speed_10m: [], precipitation: [] } })
  for (const cell of [{ w: 800, h: 120, size: 'SMALL' }, { w: 400, h: 240, size: 'MEDIUM' }, { w: 800, h: 240, size: 'LARGE' }, { w: 800, h: 480, size: 'XL' }]) {
    assert.equal(hash('weather:1', daily(.1), cell), hash('weather:1', daily(.2), cell))
    assert.notEqual(hash('weather:1', daily(.1), cell), hash('weather:1', daily(.3), cell))
    assert.equal(hash('weather:1', daily(.3), cell), hash('weather:1', daily(.4), cell))
    assert.equal(hash('weather:1', daily(1, .1), cell), hash('weather:1', daily(1, .2), cell))
    assert.notEqual(hash('weather:1', daily(1, .1), cell), hash('weather:1', daily(1, .3), cell))
    assert.equal(hash('weather:1', daily(1, 0, 71), cell), hash('weather:1', daily(1, 0, 63), cell))
  }
})

test('Surf excludes operational state and normalizes visible precision while retaining ratings and winners', () => {
  const base = { spotId: 'a', spot: 'A', rating: 3, inputs: { swell_height_m: 1.201, swell_period_s: 8.1, wind_speed_ms: 4.1, wind_direction_deg: 91 } }
  assert.equal(hash('surf:1', { ...base, cacheAge: 1, debug: { request: 'a' }, fetched_at: 'one' }),
    hash('surf:1', { ...base, cacheAge: 900, debug: { request: 'b' }, fetched_at: 'two' }))
  assert.equal(hash('surf:1', base), hash('surf:1', { ...base, inputs: { ...base.inputs, swell_height_m: 1.204 } }))
  for (const changed of [
    { ...base, inputs: { ...base.inputs, swell_period_s: 9 } },
    { ...base, inputs: { ...base.inputs, wind_speed_ms: 5 } },
    { ...base, rating: 4 },
    { ...base, breakdown: { experience: { matched: true, rating_1_6: 6 } } },
    { ...base, spotId: 'winner-b', spot: 'B' },
  ]) assert.notEqual(hash('surf:1', base), hash('surf:1', changed))
})

test('Stocks ignores backend timestamps, generated signatures, and unselected ranges', () => {
  const cell = { w: 400, h: 240 }
  const base = { symbol: 'ONE', name: 'One', chartRange: 'day', quote: { price: 12.341, changePercent: 1.234, asOf: 'one' }, selectedSeries: [10, 11, 12], series: { year: [1, 8] }, signature: 'a' }
  assert.equal(hash('stocks:1', base, cell), hash('stocks:1', { ...base, quote: { ...base.quote, price: 12.344, asOf: 'two' }, series: { year: [99] }, signature: 'b' }, cell))
  assert.notEqual(hash('stocks:1', base, cell), hash('stocks:1', { ...base, quote: { ...base.quote, price: 12.35 } }, cell))
  assert.notEqual(hash('stocks:1', base, cell), hash('stocks:1', { ...base, quote: { ...base.quote, changePercent: 1.25 } }, cell))
})

test('Stocks projects displayed range, purchase state, exact chart pixels, baseline, and invalid-series policy', () => {
  const adaptive = { w: 400, h: 240, size: 'ADAPTIVE' }
  const stock = (series, baselinePrice, extra = {}) => ({ symbol: 'ONE', quote: { price: 12, changePercent: 1 }, selectedSeries: series, baselinePrice, ...extra })
  assert.notEqual(hash('stocks:1', stock([10, 11, 12], 10), adaptive), hash('stocks:1', stock([110, 111, 112], 110), adaptive))
  assert.notEqual(hash('stocks:1', stock([10, 11, 12], 10.2), adaptive), hash('stocks:1', stock([10, 11, 12], 10.8), adaptive))
  assert.equal(hash('stocks:1', stock([10, 11, 12], 10.20001), adaptive), hash('stocks:1', stock([10, 11, 12], 10.20002), adaptive))
  const small = { w: 800, h: 120, size: 'SMALL' }
  assert.notEqual(hash('stocks:1', stock([10, 11], 10), small), hash('stocks:1', stock([10, 11], 10, { purchasePrice: 9, personalChangePercent: 3.2 }), small))
  assert.equal(physicalRenderProjection('stocks:1', stock([10], 10), adaptive, { module: {} }).visible.chart, undefined)
  assert.equal(physicalRenderProjection('stocks:1', stock([10], 10), { w: 400, h: 240, size: 'MEDIUM' }, { module: {} }).visible.chart.state, 'no_chart_data')
})

test('Stocks legacy SMALL, LARGE, and XL follow fixed detail renderers', () => {
  const base = { symbol: 'ONE', quote: { price: 12, changePercent: 1, open: 10, high: 14, low: 9, previousClose: 11, change: 1 }, selectedSeries: [10, 12] }
  const small = { w: 800, h: 120, size: 'SMALL' }, large = { w: 800, h: 240, size: 'LARGE' }, xl = { w: 800, h: 480, size: 'XL' }
  for (const field of ['open', 'high', 'low', 'previousClose', 'change']) {
    const changed = structuredClone(base); changed.quote[field] += 1
    assert.notEqual(hash('stocks:1', base, large), hash('stocks:1', changed, large)); assert.equal(hash('stocks:1', base, small), hash('stocks:1', changed, small))
  }
  assert.notEqual(hash('stocks:1', base, xl), hash('stocks:1', { ...base, quote: { ...base.quote, high: 20 } }, xl))
  assert.notEqual(hash('stocks:1', { ...base, purchasePrice: 9, personalChangePercent: 2 }, large), hash('stocks:1', { ...base, purchasePrice: 9, personalChangePercent: 3 }, large))
})

test('Soccer table is geometry-aware', () => {
  const base = { teamName: 'A', next: { homeShort: 'A', awayShort: 'B', utc: '2026-09-08T18:00:00Z' }, standing: { position: 2 }, table: [{ position: 1, teamShort: 'X', points: 10 }] }
  const changed = { ...base, table: [{ position: 1, teamShort: 'X', points: 11 }] }
  assert.equal(hash('soccer:1', base), hash('soccer:1', changed))
  assert.notEqual(hash('soccer:1', base, { w: 800, h: 480 }), hash('soccer:1', changed, { w: 800, h: 480 }))
})

test('Soccer legacy families use medium panels and selected-team table windows', () => {
  const table = Array.from({ length: 12 }, (_, i) => ({ position: i + 1, teamShort: `T${i}`, points: 20 - i, isSelected: i === 7 }))
  const base = { next: { homeShort: 'A', awayShort: 'B', utc: '2026-09-08T18:00:00Z' }, last: { homeShort: 'A', awayShort: 'C', score: '2-1' }, standing: { position: 8, points: 20, won: 5, draw: 2, lost: 1, goalsFor: 10, goalsAgainst: 5, form: ['W'] }, table, topScorer: { name: 'Player', goals: 7 } }
  const medium = { w: 400, h: 240, size: 'MEDIUM' }, large = { w: 800, h: 240, size: 'LARGE' }, xl = { w: 800, h: 480, size: 'XL' }
  assert.notEqual(hash('soccer:1', base, medium), hash('soccer:1', { ...base, last: { ...base.last, score: '3-1' } }, medium))
  const inside = structuredClone(base); inside.table[7].points++
  const outside = structuredClone(base); outside.table[0].points++
  assert.notEqual(hash('soccer:1', base, large), hash('soccer:1', inside, large)); assert.equal(hash('soccer:1', base, large), hash('soccer:1', outside, large))
  const moved = structuredClone(base); moved.table.forEach((row, i) => { row.isSelected = i === 1 })
  assert.notEqual(hash('soccer:1', base, large), hash('soccer:1', moved, large))
  assert.notEqual(hash('soccer:1', base, xl), hash('soccer:1', { ...base, topScorer: { name: 'Other', goals: 8 } }, xl))
})

test('off-screen groceries/reminders do not dirty tiles and grocery rotation has a hard boundary', () => {
  const groceries = { items: Array.from({ length: 8 }, (_, i) => ({ name: `Item ${i}`, quantity: 1 })) }
  const altered = structuredClone(groceries); altered.items[7].name = 'Hidden edit'
  assert.equal(hash('groceries', groceries, undefined, {}, 0), hash('groceries', altered, undefined, {}, 0))
  assert.notEqual(hash('groceries', groceries, undefined, {}, 0), hash('groceries', groceries, undefined, {}, 14_400_000))
  const settings = { cells: [{ module: 'groceries', w: 200, h: 120 }], modules: {} }
  const deadlines = physicalModuleDeadlines({ settings, sources: { groceries }, now: 1 })
  assert.deepEqual(deadlines.groceries[0], { at: 14_400_000, type: 'hard', reason: 'grocery_rotation' })

  const reminders = { items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] }
  const remindersChanged = structuredClone(reminders); remindersChanged.items[2].title = 'Hidden'
  assert.equal(hash('reminders', reminders), hash('reminders', remindersChanged))
})

test('Reminder rotation projects the firmware bucket page and schedules only a changing boundary', () => {
  const cell = { module: 'reminders', w: 400, h: 240, size: 'MEDIUM' }
  const items = Array.from({ length: 5 }, (_, i) => ({ title: `R${i}`, occurrence_date: '2026-09-07', display_date: 'Today', days_until: 0, display_time: `${10 + i}:00` }))
  const edited = structuredClone(items); edited[4].title = 'edited hidden'
  assert.equal(hash('reminders', { items }, cell, {}, 0), hash('reminders', { items: edited }, cell, {}, 0))
  assert.notEqual(hash('reminders', { items }, cell, {}, 0), hash('reminders', { items }, cell, {}, 14_400_000))
  assert.notEqual(hash('reminders', { items }, cell, {}, 14_400_000), hash('reminders', { items: edited }, cell, {}, 14_400_000))
  const deadlines = physicalModuleDeadlines({ settings: { cells: [cell], modules: {} }, sources: { reminders: { items } }, now: 1 })
  assert.ok(deadlines.reminders.some((deadline) => deadline.reason === 'reminder_rotation' && deadline.at === 14_400_000 && deadline.type === 'hard'))
})

test('Countdown template rotation is small-only and retains midnight', () => {
  const source = { items: [{ title: 'Holiday', days_left: 20, target_date: '2026-09-27' }] }
  const small = { module: 'countdown', w: 800, h: 120, size: 'SMALL' }, medium = { ...small, w: 400, h: 240, size: 'MEDIUM' }
  assert.notEqual(hash('countdown', source, small, {}, 14_399_999), hash('countdown', source, small, {}, 14_400_000))
  assert.equal(hash('countdown', source, medium, {}, 14_399_999), hash('countdown', source, medium, {}, 14_400_000))
  const deadlines = physicalModuleDeadlines({ settings: { cells: [small], modules: {} }, sources: { countdown: source }, now: 1 }).countdown
  assert.ok(deadlines.some((deadline) => deadline.reason === 'countdown_template_rotation'))
  assert.ok(deadlines.some((deadline) => deadline.reason === 'midnight'))
})

test('Countdown LARGE and XL include hero, four upcoming rows, and calendar state', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ title: `Event ${i}`, days_left: i + 1, target_date: `2026-09-${String(i + 8).padStart(2, '0')}` }))
  const large = { w: 800, h: 240, size: 'LARGE' }, xl = { w: 800, h: 480, size: 'XL' }
  for (const index of [1, 4]) { const changed = structuredClone(items); changed[index].title = 'Changed'; assert.notEqual(hash('countdown', { items }, large), hash('countdown', { items: changed }, large)) }
  const hidden = structuredClone(items); hidden[5].title = 'Hidden'; assert.equal(hash('countdown', { items }, large), hash('countdown', { items: hidden }, large))
  const target = structuredClone(items); target[0].target_date = '2026-10-01'; assert.notEqual(hash('countdown', { items }, xl), hash('countdown', { items: target }, xl))
})

test('Countdown normalizes, derives and sorts before selecting visible rows', () => {
  const cell = { w: 400, h: 240, size: 'MEDIUM' }, now = Date.parse('2026-01-01T12:00Z')
  const sorted = { items: [{ title: 'Soon', target_date: '2026-01-02' }, { title: 'Later', target_date: '2026-01-05' }] }
  const reversed = { items: [...sorted.items].reverse() }
  assert.equal(hash('countdown', sorted, cell, {}, now), hash('countdown', reversed, cell, {}, now))
  assert.notEqual(hash('countdown', sorted, cell, {}, now), hash('countdown', { items: [{ ...sorted.items[1], pinned: true }, sorted.items[0]] }, cell, {}, now))
  assert.equal(physicalRenderProjection('countdown', sorted, cell, {}, now).visible.items[0].days_left, 1)
})

test('Groceries projects today heading, visible menus and bottom-panel-reduced item capacity', () => {
  const today = '1970-01-01', dinners = [{ date: today, title: 'Tacos' }, ...Array.from({ length: 9 }, (_, i) => ({ date: `1970-01-${String(i + 2).padStart(2, '0')}`, title: i === 0 ? 'Soup' : i === 1 ? 'Fish' : `Dinner ${i}` }))]
  const items = Array.from({ length: 12 }, (_, i) => ({ name: `I${i}` }))
  const compact = { w: 400, h: 240, size: 'ADAPTIVE' }
  assert.notEqual(hash('groceries', { items, dinner_plan: dinners }, compact, {}, 0), hash('groceries', { items, dinner_plan: [{ ...dinners[0], title: 'Pizza' }, ...dinners.slice(1)] }, compact, {}, 0))
  const menuCell = { w: 600, h: 240, size: 'ADAPTIVE' }
  const hiddenDinner = structuredClone(dinners); hiddenDinner.at(-1).title = 'Still hidden'
  assert.equal(hash('groceries', { items, dinner_plan: dinners }, menuCell, {}, 0), hash('groceries', { items, dinner_plan: hiddenDinner }, menuCell, {}, 0))
  const visibleDinner = structuredClone(dinners); visibleDinner[1].title = 'Stew'
  assert.notEqual(hash('groceries', { items, dinner_plan: dinners }, menuCell, {}, 0), hash('groceries', { items, dinner_plan: visibleDinner }, menuCell, {}, 0))
  const expanded = { w: 800, h: 480, size: 'ADAPTIVE' }
  const plain = physicalRenderProjection('groceries', { items, dinner_plan: [] }, expanded, {}, 0).visible.items.length
  const withBottom = physicalRenderProjection('groceries', { items, dinner_plan: [], insights: { running_low: [{ name: 'Milk' }], recipes: [{ name: 'Pasta', missing: ['Pasta'] }] } }, expanded, {}, 0).visible.items.length
  assert.ok(withBottom < plain)
  assert.deepEqual(physicalRenderProjection('groceries', { items }, { w: 800, h: 120, size: 'ADAPTIVE' }, {}, 14_400_000).visible.items.map((item) => item.name), ['I1', 'I2', 'I3'])
})

test('Groceries legacy LARGE and XL project fixed menu and insight panels', () => {
  const items = [{ name: 'Milk' }], large = { w: 800, h: 240, size: 'LARGE' }, xl = { w: 800, h: 480, size: 'XL' }
  const empty = { items, dinner_plan: [] }, one = { items, dinner_plan: [{ date: '1970-01-02', title: 'Soup' }] }
  assert.notEqual(hash('groceries', empty, large, {}, 0), hash('groceries', one, large, {}, 0))
  assert.notEqual(hash('groceries', one, large, {}, 0), hash('groceries', { ...one, dinner_plan: [{ date: '1970-01-02', title: 'Stew' }] }, large, {}, 0))
  const many = { items, dinner_plan: Array.from({ length: 9 }, (_, i) => ({ date: `1970-01-${String(i + 2).padStart(2, '0')}`, title: `D${i}` })) }
  const hidden = structuredClone(many); hidden.dinner_plan[8].title = 'Hidden'; assert.equal(hash('groceries', many, large, {}, 0), hash('groceries', hidden, large, {}, 0))
  const insights = { running_low: [{ name: 'Eggs', label: 'low' }], recipes: [{ name: 'Pasta', missing: ['cheese'] }] }
  assert.notEqual(hash('groceries', { ...empty, insights }, xl, {}, 0), hash('groceries', { ...empty, insights: { ...insights, running_low: [{ name: 'Bread', label: 'low' }] } }, xl, {}, 0))
  assert.notEqual(hash('groceries', { ...empty, insights }, xl, {}, 0), hash('groceries', { ...empty, insights: { ...insights, recipes: [{ name: 'Soup', missing: ['onion'] }] } }, xl, {}, 0))
})

test('Groceries local midnight deadline is emitted only when dinner pixels change', () => {
  const cell = { module: 'groceries', w: 800, h: 240, size: 'LARGE' }, settings = { cells: [cell], modules: {} }
  const before = Date.parse('2026-01-01T22:59:00Z'), after = Date.parse('2026-01-01T23:00:00Z')
  const source = { items: [{ name: 'Milk' }], dinner_plan: [{ date: '2026-01-01', title: 'Soup' }, { date: '2026-01-02', title: 'Fish' }] }
  assert.notEqual(hash('groceries', source, cell, {}, before), hash('groceries', source, cell, {}, after))
  assert.ok(physicalModuleDeadlines({ settings, sources: { groceries: source }, now: before }).groceries.some((d) => d.reason === 'grocery_midnight' && d.at === after))
  const stable = { items: [{ name: 'Milk' }], dinner_plan: [] }
  assert.ok(!physicalModuleDeadlines({ settings, sources: { groceries: stable }, now: before }).groceries.some((d) => d.reason === 'grocery_midnight'))
})

test('Reminder SMALL evening note is projected and conditionally scheduled', () => {
  const cell = { module: 'reminders', w: 800, h: 120, size: 'SMALL' }, settings = { cells: [cell], modules: {} }
  const source = { items: [{ title: 'Today', days_until: 0 }, { title: 'Tomorrow', days_until: 1 }] }
  const before = Date.parse('2026-01-01T15:59:00Z'), after = Date.parse('2026-01-01T16:00:00Z')
  assert.notEqual(hash('reminders', source, cell, {}, before), hash('reminders', source, cell, {}, after))
  assert.ok(physicalModuleDeadlines({ settings, sources: { reminders: source }, now: before }).reminders.some((d) => d.reason === 'reminder_evening' && d.at === after))
  const noTomorrow = { items: source.items.slice(0, 1) }
  assert.ok(!physicalModuleDeadlines({ settings, sources: { reminders: noTomorrow }, now: before }).reminders.some((d) => d.reason === 'reminder_evening'))
})

test('Reminder LARGE calendar dots and XL next list are part of physical state', () => {
  const now = Date.parse('2026-01-05T12:00Z'), large = { w: 800, h: 240, size: 'LARGE' }, xl = { w: 800, h: 480, size: 'XL' }
  const base = { items: [{ title: 'Today', occurrence_date: '2026-01-05', days_until: 0 }, { title: 'Calendar', occurrence_date: '2026-01-20', days_until: 15 }] }
  const moved = structuredClone(base); moved.items[1].occurrence_date = '2026-02-20'
  assert.notEqual(hash('reminders', base, large, {}, now), hash('reminders', moved, large, {}, now))
  const renamed = structuredClone(base); renamed.items[1].title = 'Changed next'
  assert.notEqual(hash('reminders', base, xl, {}, now), hash('reminders', renamed, xl, {}, now))
  const hidden = structuredClone(base); hidden.items.push({ title: 'Far', occurrence_date: '2027-01-01', days_until: 361 })
  assert.equal(hash('reminders', base, large, {}, now), hash('reminders', hidden, large, {}, now))
})

test('Reminder XL next list preserves same-date cache order and ignores hidden sixth candidate', () => {
  const now = Date.parse('2026-01-05T12:00Z'), cell = { w: 800, h: 480, size: 'XL' }
  const items = [{ title: 'Today', occurrence_date: '2026-01-05', days_until: 0 }, ...['Zulu', 'Alpha', 'Late', 'Early', 'Fifth', 'Hidden'].map((title, i) => ({ title, occurrence_date: '2026-01-20', display_time: `${20 - i}:00`, days_until: 15 }))]
  const visible = physicalRenderProjection('reminders', { items }, cell, {}, now).visible.next
  assert.deepEqual(visible.map((row) => row.title), ['Zulu', 'Alpha', 'Late', 'Early', 'Fifth'])
  const changed = structuredClone(items); changed[5].title = 'Changed fifth'
  assert.notEqual(hash('reminders', { items }, cell, {}, now), hash('reminders', { items: changed }, cell, {}, now))
  const hidden = structuredClone(items); hidden[6].title = 'Changed hidden'
  assert.equal(hash('reminders', { items }, cell, {}, now), hash('reminders', { items: hidden }, cell, {}, now))
})

test('Adaptive Grocery menus select future dinners chronologically', () => {
  const now = Date.parse('2026-09-08T12:00Z'), cell = { w: 600, h: 240, size: 'ADAPTIVE' }
  const dinner_plan = ['12', '10', '11', '20', '21', '22', '23', '24', '25'].map((day) => ({ date: `2026-09-${day}`, title: `Dinner ${day}` }))
  const projection = physicalRenderProjection('groceries', { items: [], dinner_plan }, cell, {}, now).visible
  assert.deepEqual(projection.menu.rows.slice(0, 3).map((row) => row.date), ['2026-09-10', '2026-09-11', '2026-09-12'])
  const visible = structuredClone(dinner_plan); visible[1].title = 'Changed'; assert.notEqual(hash('groceries', { dinner_plan }, cell, {}, now), hash('groceries', { dinner_plan: visible }, cell, {}, now))
  const hidden = structuredClone(dinner_plan); hidden.at(-1).title = 'Hidden'; assert.equal(hash('groceries', { dinner_plan }, cell, {}, now), hash('groceries', { dinner_plan: hidden }, cell, {}, now))
})

test('Surf XL projects environmental panel and trend changes only at effective boundaries', () => {
  const xl = { w: 800, h: 480, size: 'XL' }, medium = { module: 'surf:1', w: 400, h: 240, size: 'MEDIUM' }
  const base = { spot: 'A', rating: 3, dayparts: [{ rating: 1 }, { rating: 3 }, { rating: 2 }, { rating: 2 }], air: { temp_min_c: 8, temp_max_c: 12 }, water: { temp_min_c: 9, temp_max_c: 10 }, sun: { sunrise: '07:00', sunset: '19:00' }, weather: { code: 2 } }
  for (const change of [{ air: { temp_min_c: 7, temp_max_c: 12 } }, { water: { temp_min_c: 8, temp_max_c: 10 } }, { sun: { sunrise: '07:30', sunset: '19:00' } }, { weather: { code: 61 } }]) assert.notEqual(hash('surf:1', base, xl), hash('surf:1', { ...base, ...change }, xl))
  const before = Date.parse('2026-01-01T08:59:00Z'), after = Date.parse('2026-01-01T09:00:00Z')
  assert.notEqual(hash('surf:1', base, medium, {}, before), hash('surf:1', base, medium, {}, after))
  const flat = { ...base, dayparts: [{ rating: 2 }, { rating: 2 }, { rating: 2 }, { rating: 2 }] }
  assert.equal(hash('surf:1', flat, medium, {}, before), hash('surf:1', flat, medium, {}, after))
  const settings = { cells: [medium], modules: { surf: [{ id: 1 }] } }
  assert.ok(physicalModuleDeadlines({ settings, sources: { 'surf:1': base }, now: before })['surf:1'].some((d) => d.reason === 'surf_daypart'))
})

test('Surf XL and trend honor field-by-field and picked fallbacks', () => {
  const xl = { w: 800, h: 480, size: 'XL' }, medium = { w: 400, h: 240, size: 'MEDIUM' }
  const base = { air: { temp_c: 10 }, weather: { temp_min_c: 7 }, picked: { sunrise: '07:00', sunset: '19:00', weather_code: 2 }, dayparts: [{ stars: 1 }, { picked: { rating: 4 } }, { stars: 2 }, { stars: 2 }] }
  assert.notEqual(hash('surf:1', base, xl), hash('surf:1', { ...base, weather: { temp_min_c: 8 } }, xl))
  assert.notEqual(hash('surf:1', base, xl), hash('surf:1', { ...base, picked: { ...base.picked, sunrise: '07:30' } }, xl))
  assert.notEqual(hash('surf:1', base, xl), hash('surf:1', { ...base, picked: { ...base.picked, weather_code: 61 } }, xl))
  assert.notEqual(hash('surf:1', base, medium, {}, Date.parse('2026-01-01T08:59Z')), hash('surf:1', base, medium, {}, Date.parse('2026-01-01T09:00Z')))
})

test('Surf visible rows and trend preserve picked and matched-experience rating state', () => {
  const medium = { w: 400, h: 240, size: 'MEDIUM' }, xl = { w: 800, h: 480, size: 'XL' }, now = Date.parse('2026-01-01T09:00Z')
  const parts = (second) => ({ dayparts: [{ rating: 1 }, second, { rating: 2 }, { rating: 2 }] })
  assert.notEqual(hash('surf:1', parts({ rating: 2 }), medium, {}, now), hash('surf:1', parts({ breakdown: { experience: { matched: true, rating_1_6: 5 } } }), medium, {}, now))
  assert.notEqual(hash('surf:1', parts({ picked: { rating: 2 } }), medium, {}, now), hash('surf:1', parts({ picked: { rating: 5 } }), medium, {}, now))
  const normal = parts({ rating: 4 }), experience = parts({ rating: 4, experience: { matched: true, rating_1_6: 4 } })
  assert.notEqual(hash('surf:1', normal, medium, {}, now), hash('surf:1', experience, medium, {}, now))
  const unmatched = parts({ rating: 3, experience: { matched: false, rating_1_6: 6 } })
  assert.equal(physicalRenderProjection('surf:1', unmatched, medium, {}, now).visible.dayparts[1].rating, 3)
  const daily = { daily: [{ picked: { rating: 2 } }] }, dailyDice = { daily: [{ picked: { experience: { matched: true, rating_1_6: 5 } } }] }
  assert.notEqual(hash('surf:1', daily, xl, {}, now), hash('surf:1', dailyDice, xl, {}, now))
})

test('Surf resolves main, daypart and daily picked fields independently', () => {
  const medium = { w: 400, h: 240, size: 'MEDIUM' }, xl = { w: 800, h: 480, size: 'XL' }
  const main = { inputs: { swell_height_m: 1.2 }, picked: { inputs: { wind_speed_ms: 3, swell_period_s: 8 } } }
  assert.notEqual(hash('surf:1', main, medium), hash('surf:1', { ...main, picked: { inputs: { ...main.picked.inputs, wind_speed_ms: 4 } } }, medium))
  assert.notEqual(hash('surf:1', main, medium), hash('surf:1', { ...main, picked: { inputs: { ...main.picked.inputs, swell_period_s: 9 } } }, medium))
  const daypart = { dayparts: [{ picked: { waveRange: '1-2 m', period_s: 8, wind_ms: 3, rating: 3 } }, {}, {}, {}] }
  for (const [field, value] of [['waveRange', '2-3 m'], ['period_s', 9], ['wind_ms', 4]]) {
    const changed = structuredClone(daypart); changed.dayparts[0].picked[field] = value
    assert.notEqual(hash('surf:1', daypart, medium), hash('surf:1', changed, medium))
  }
  const daily = { daily: [{ picked: { label: 'Wed', wave_range: '1-2 m', period: 8, wind: 3, rating: 3 } }, {}] }
  for (const [field, value] of [['label', 'Thu'], ['wave_range', '2-3 m'], ['period', 9], ['wind', 4]]) {
    const changed = structuredClone(daily); changed.daily[0].picked[field] = value
    assert.notEqual(hash('surf:1', daily, xl), hash('surf:1', changed, xl))
  }
  assert.equal(hash('surf:1', main, medium), hash('surf:1', { ...main, picked: { ...main.picked, requestId: 'hidden' } }, medium))
})

test('Surf main wave text mirrors firmware fallback and normalization', () => {
  const cell = { w: 800, h: 120, size: 'SMALL' }
  const wave = (value) => physicalRenderProjection('surf:1', value, cell).visible.wave
  assert.notEqual(hash('surf:1', { picked: { forecast: { wave_height_range_label: '1-2m' } } }, cell), hash('surf:1', { picked: { forecast: { wave_height_range_label: '2-3m' } } }, cell))
  assert.notEqual(hash('surf:1', { picked: { line1: 'Clean waves' } }, cell), hash('surf:1', { picked: { line1: 'Messy waves' } }, cell))
  assert.notEqual(hash('surf:1', { picked: { summary: 'Clean waves' } }, cell), hash('surf:1', { picked: { summary: 'Messy waves' } }, cell))
  assert.equal(hash('surf:1', { forecast: { wave_height_range_label: '1-2m' }, picked: { summary: 'Hidden one' } }, cell), hash('surf:1', { forecast: { wave_height_range_label: '1-2m' }, picked: { summary: 'Hidden two' } }, cell))
  assert.equal(hash('surf:1', { forecast: { wave_height_range_label: '1-2m' } }, cell), hash('surf:1', { forecast: { wave_height_range_label: '1 - 2 m' } }, cell))
  assert.equal(wave({ forecast: { wave_height_range_label: '' }, line1: '1-2m' }), '1 - 2 m')
  assert.notEqual(hash('surf:1', { forecast: { wave_height_range_label: '' }, line1: '1-2m' }, cell), hash('surf:1', { forecast: { wave_height_range_label: '' }, line1: '2-3m' }, cell))
  assert.equal(wave({ forecast: { wave_height_range_label: '' }, picked: { wave_height_range_label: '2-3m' } }), '2 - 3 m')
  assert.equal(wave({ forecast: { wave_height_range_label: '' }, line1: '', summary: '', picked: { line1: '', summary: '' } }), '--')
  assert.notEqual(hash('surf:1', { forecast: { wave_height_range_label: '1 - 2m' } }, cell), hash('surf:1', { forecast: { wave_height_range_label: '1  - 2m' } }, cell))
  assert.equal(wave({ forecast: { wave_height_range_label: '1-   2m   ' } }), '1 - 2 m')
  assert.equal(wave({ forecast: { wave_height_range_label: '1é-2m' } }), '1 - - - 2 m')
})

test('Surf needs follow legacy renderer families and adaptive policy', () => {
  const dayparts = [{ rating: 1 }, { rating: 2 }, { rating: 3 }, { rating: 4 }], daily = [{ label: 'A', rating: 1 }, { label: 'B', rating: 2 }]
  const xl = { module: 'surf:1', w: 800, h: 480, size: 'XL' }, large = { module: 'surf:1', w: 800, h: 240, size: 'LARGE' }
  assert.equal(hash('surf:1', { dayparts, daily }, xl), hash('surf:1', { dayparts: [{ rating: 6 }], daily }, xl))
  assert.notEqual(hash('surf:1', { dayparts, daily }, xl), hash('surf:1', { dayparts, daily: [{ label: 'Changed', rating: 1 }, daily[1]] }, xl))
  assert.notEqual(hash('surf:1', { dayparts, daily }, large), hash('surf:1', { dayparts: [{ rating: 6 }, ...dayparts.slice(1)], daily }, large))
  assert.equal(hash('surf:1', { dayparts, daily }, large), hash('surf:1', { dayparts, daily: [{ label: 'Changed' }] }, large))
  const settings = { cells: [xl], modules: { surf: [{ id: 1, spotId: 'spot' }] } }
  const request = buildContentRequestPlan({ settings, deviceId: 'device', origin: 'https://example.test' }).requests[0].url
  assert.equal(request.searchParams.get('daily'), '1'); assert.equal(request.searchParams.has('dayparts'), false)
  const adaptive = { w: 800, h: 480, size: 'ADAPTIVE' }
  assert.notEqual(hash('surf:1', { dayparts, daily }, adaptive), hash('surf:1', { dayparts: [{ rating: 6 }], daily }, adaptive))
})

test('Oslo midnight deadlines remain correct across both 2026 DST transitions', () => {
  const modules = ['date', 'countdown', 'reminders', 'groceries']
  const settings = { cells: modules.map((module) => ({ module, w: 200, h: 120, size: 'ADAPTIVE' })), modules: {} }
  for (const [now, expected, today, tomorrow] of [
    ['2026-03-28T12:00:00Z', '2026-03-28T23:00:00Z', '2026-03-28', '2026-03-29'],
    ['2026-10-24T12:00:00Z', '2026-10-24T22:00:00Z', '2026-10-24', '2026-10-25'],
  ]) {
    const deadlines = physicalModuleDeadlines({ settings, sources: { countdown: { items: [] }, reminders: { items: [] }, groceries: { items: [], dinner_plan: [{ date: today, title: 'Today' }, { date: tomorrow, title: 'Tomorrow' }] } }, now: Date.parse(now) })
    assert.equal(deadlines.date.find((d) => d.reason === 'midnight').at, Date.parse(expected))
    assert.equal(deadlines.countdown.find((d) => d.reason === 'midnight').at, Date.parse(expected))
    assert.equal(deadlines.reminders.find((d) => d.reason === 'midnight').at, Date.parse(expected))
    assert.equal(deadlines.groceries.find((d) => d.reason === 'grocery_midnight').at, Date.parse(expected))
  }
})

test('Surf identifiers and unused line2 do not contaminate visible hashes', () => {
  const value = { spot: 'Same label', spotId: 'one', selected_spot_id: 'one', rating: 3, line2: 'unused A' }
  assert.equal(hash('surf:1', value), hash('surf:1', { ...value, spotId: 'two', selected_spot_id: 'two', line2: 'unused B' }))
})

test('theme changes hash while refresh and source coordinates do not', () => {
  const source = { current: { temperature_2m: 12, weather_code: 1 } }
  const settings = (theme, refresh, lat) => ({ theme, cells: [{ module: 'weather:1', w: 200, h: 120 }], modules: { weather: [{ id: 1, refresh, lat, lon: 10, units: 'metric' }] } })
  assert.equal(physicalRenderManifest({ settings: settings('light', 10, 1), sources: { 'weather:1': source } })[0].render_hash,
    physicalRenderManifest({ settings: settings('light', 999, 2), sources: { 'weather:1': source } })[0].render_hash)
  assert.notEqual(physicalRenderManifest({ settings: settings('light', 10, 1), sources: { 'weather:1': source } })[0].render_hash,
    physicalRenderManifest({ settings: settings('dark', 10, 1), sources: { 'weather:1': source } })[0].render_hash)
})
