import assert from 'node:assert/strict'
import test from 'node:test'
import { physicalModuleDeadlines, physicalRenderDigest, physicalRenderManifest } from '../app/lib/device/contentSignature.mjs'

const hash = (kind, value, cell = { w: 200, h: 120, colSpan: 1, rowSpan: 1 }, config = {}, now) =>
  physicalRenderDigest(kind, value, cell, { language: 'en', timeZone: 'Europe/Oslo', module: config }, now)

test('Weather hashes renderer-rounded temperature, condition icon, and only geometry-visible forecasts', () => {
  const weather = (temperature, code = 1) => ({ current: { temperature_2m: temperature, weather_code: code }, hourly: { temperature_2m: [1, 2] } })
  assert.equal(hash('weather:1', weather(12.2)), hash('weather:1', weather(12.3)))
  assert.notEqual(hash('weather:1', weather(12.2)), hash('weather:1', weather(13)))
  assert.notEqual(hash('weather:1', weather(12.2, 1)), hash('weather:1', weather(12.2, 63)))
  assert.equal(hash('weather:1', weather(12.2)), hash('weather:1', { ...weather(12.2), hourly: { temperature_2m: [99] } }))
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

test('theme changes hash while refresh and source coordinates do not', () => {
  const source = { current: { temperature_2m: 12, weather_code: 1 } }
  const settings = (theme, refresh, lat) => ({ theme, cells: [{ module: 'weather:1', w: 200, h: 120 }], modules: { weather: [{ id: 1, refresh, lat, lon: 10, units: 'metric' }] } })
  assert.equal(physicalRenderManifest({ settings: settings('light', 10, 1), sources: { 'weather:1': source } })[0].render_hash,
    physicalRenderManifest({ settings: settings('light', 999, 2), sources: { 'weather:1': source } })[0].render_hash)
  assert.notEqual(physicalRenderManifest({ settings: settings('light', 10, 1), sources: { 'weather:1': source } })[0].render_hash,
    physicalRenderManifest({ settings: settings('dark', 10, 1), sources: { 'weather:1': source } })[0].render_hash)
})
