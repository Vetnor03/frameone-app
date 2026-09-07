import assert from 'node:assert/strict'
import test from 'node:test'
import { physicalModuleDeadlines, physicalRenderDigest, physicalRenderManifest, physicalRenderProjection } from '../app/lib/device/contentSignature.mjs'

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

test('Surf excludes operational state and normalizes visible precision while retaining ratings and winners', () => {
  const base = { spotId: 'a', spot: 'A', rating: 3, inputs: { swell_height_m: 1.201, swell_period_s: 8.1, wind_speed_ms: 4.1, wind_direction_deg: 91 } }
  assert.equal(hash('surf:1', { ...base, cacheAge: 1, debug: { request: 'a' }, fetched_at: 'one' }),
    hash('surf:1', { ...base, cacheAge: 900, debug: { request: 'b' }, fetched_at: 'two' }))
  assert.equal(hash('surf:1', base), hash('surf:1', { ...base, inputs: { ...base.inputs, swell_height_m: 1.204 } }))
  for (const changed of [
    { ...base, inputs: { ...base.inputs, swell_height_m: 1.3 } },
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

test('Soccer table is geometry-aware', () => {
  const base = { teamName: 'A', next: { homeShort: 'A', awayShort: 'B', utc: '2026-09-08T18:00:00Z' }, standing: { position: 2 }, table: [{ position: 1, teamShort: 'X', points: 10 }] }
  const changed = { ...base, table: [{ position: 1, teamShort: 'X', points: 11 }] }
  assert.equal(hash('soccer:1', base), hash('soccer:1', changed))
  assert.notEqual(hash('soccer:1', base, { w: 800, h: 480 }), hash('soccer:1', changed, { w: 800, h: 480 }))
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
