import assert from 'node:assert/strict'
import test from 'node:test'
import { activePhysicalReferences, buildContentRequestPlan, canonicalVisible, collectVisibleContent, contentDigest, withPhysicalCellGeometry } from '../app/lib/device/contentSignature.mjs'
import { customPhysicalPayload } from '../app/lib/customLayouts.mjs'

const origin = 'https://example.test'
const deviceId = 'frame-1'
const modules = {
  weather: [{ id: 1, lat: 1, lon: 1 }, { id: 2, lat: 2, lon: 2 }, { id: 3, lat: 3, lon: 3 }],
  surf: [{ id: 1, spotId: 'a' }, { id: 2, spotId: 'b' }],
  soccer: [{ id: 3, teamId: 'team', competitionId: 'league' }],
  stocks: [{ id: 1, symbol: 'ONE' }, { id: 2, symbol: 'TWO' }, { id: 3, symbol: 'THREE' }],
}
const settings = (cells, extra = {}) => ({ layout: 'custom', cells, modules: { ...modules, ...extra } })
const urls = (plan, base) => plan.requests.filter((request) => request.key.startsWith(base)).map((request) => request.url)

test('active physical references retain exact instances and base means instance one', () => {
  const refs = activePhysicalReferences(settings([{ module: 'date' }, { module: 'weather' }, { module: 'weather:2' }, { module: 'stocks:3' }]))
  assert.deepEqual([...refs.keys()], ['date', 'weather:1', 'weather:2', 'stocks:3'])
})

test('Stocks requests require and select only exact active ids', () => {
  const single = buildContentRequestPlan({ settings: settings([{ module: 'stocks:2' }]), deviceId, origin })
  assert.deepEqual(urls(single, 'stocks').map((value) => value.searchParams.get('id')), ['2'])
  assert.equal(urls(single, 'stocks').some((value) => !value.searchParams.has('id')), false)
  const multiple = buildContentRequestPlan({ settings: settings([{ module: 'stocks:2' }, { module: 'stocks:3' }]), deviceId, origin })
  assert.deepEqual(urls(multiple, 'stocks').map((value) => value.searchParams.get('id')), ['2', '3'])
})

test('inactive configured Stocks instance cannot affect fingerprint', async () => {
  const run = async (symbol) => {
    const current = settings([{ module: 'stocks:2' }], { stocks: [{ id: 1, symbol }, { id: 2, symbol: 'ACTIVE' }] })
    return contentDigest(await collectVisibleContent({ settings: current, deviceId, origin, authorization: 'Bearer token', fetchImpl: async (request) => {
      assert.equal(request.searchParams.get('id'), '2')
      return { ok: true, json: async () => ({ symbol: 'ACTIVE', price: 10 }) }
    } }))
  }
  assert.equal(await run('IGNORED-A'), await run('IGNORED-B'))
})

test('inactive Weather and Surf instances are never requested', () => {
  const plan = buildContentRequestPlan({ settings: settings([{ module: 'weather:2' }, { module: 'surf:2', size: 'small' }]), deviceId, origin })
  assert.deepEqual(plan.requests.map((request) => request.key), ['weather:2', 'surf:2'])
  assert.equal(urls(plan, 'weather')[0].searchParams.get('lat'), '2')
  assert.equal(urls(plan, 'surf')[0].searchParams.get('spotId'), 'b')
})

test('Soccer request has physical teamId and competitionId parity', () => {
  const plan = buildContentRequestPlan({ settings: settings([{ module: 'soccer:3' }]), deviceId, origin })
  const request = urls(plan, 'soccer')[0]
  assert.equal(request.searchParams.get('teamId'), 'team')
  assert.equal(request.searchParams.get('competitionId'), 'league')
})

test('Surf hashes actual frame score response and visible forecast changes alter SHA', async () => {
  const current = settings([{ module: 'surf:2', w: 800, h: 240 }])
  const run = async (wave, wind, rating) => collectVisibleContent({ settings: current, deviceId, origin, authorization: 'Bearer token', fetchImpl: async (url) => {
    assert.equal(url.pathname, '/api/surf/score'); assert.equal(url.searchParams.get('frame'), '1'); assert.equal(url.searchParams.get('dayparts'), '1')
    return { ok: true, json: async () => ({ rating, forecast: { wave_height_range_label: wave }, inputs: { wind_speed_ms: wind }, dayparts: [{ label: 'Now' }] }) }
  } })
  const before = contentDigest(await run('1-2m', 3, 4))
  const after = contentDigest(await run('2-3m', 8, 5))
  assert.notEqual(before, after)
})

test('Assistant response, not an artificial four-hour window, determines its signature', async () => {
  const current = settings([{ module: 'assistant' }])
  const run = (now) => collectVisibleContent({ settings: current, deviceId, origin, authorization: 'Bearer token', now, fetchImpl: async () => ({ ok: true, json: async () => ({ updates: [{ topic: 'Same' }] }) }) })
  assert.equal(contentDigest(await run(0)), contentDigest(await run(4 * 60 * 60 * 1000)))
})

test('Groceries rotation is included only when multiple items can rotate', async () => {
  const current = settings([{ module: 'groceries' }])
  const run = (items, now) => collectVisibleContent({ settings: current, deviceId, origin, authorization: 'Bearer token', now, fetchImpl: async () => ({ ok: true, json: async () => ({ items }) }) })
  const boundary = 4 * 60 * 60 * 1000
  assert.equal(contentDigest(await run([], 0)), contentDigest(await run([], boundary)))
  assert.equal(contentDigest(await run([{ name: 'Only' }], 0)), contentDigest(await run([{ name: 'Only' }], boundary)))
  assert.notEqual(contentDigest(await run([{ name: 'A' }, { name: 'B' }], 0)), contentDigest(await run([{ name: 'A' }, { name: 'B' }], boundary)))
})

test('real custom physical geometry drives Surf needs with firmware pixel thresholds', () => {
  const layout = { id: 'custom-1', cells: [
    { slot: 0, col: 0, row: 0, colSpan: 3, rowSpan: 4 },
    { slot: 1, col: 3, row: 0, colSpan: 1, rowSpan: 4 },
  ] }
  const payload = customPhysicalPayload(layout, { 0: 'surf:1', 1: 'date' })
  assert.ok(payload)
  assert.equal('size' in payload.cells[0], false)
  const normalized = withPhysicalCellGeometry({ ...payload, modules }, {})
  assert.deepEqual({ size: normalized.cells[0].size, w: normalized.cells[0].w, h: normalized.cells[0].h }, { size: 'ADAPTIVE', w: 600, h: 480 })
  const request = buildContentRequestPlan({ settings: normalized, deviceId, origin }).requests.find((item) => item.key === 'surf:1').url
  assert.equal(request.searchParams.get('dayparts'), '1')
  assert.equal(request.searchParams.get('daily'), '1')
})

test('canonical hashing ignores key order and volatile metadata', () => {
  const first = { visible: { rating: 4, wind: 3 }, fetched_at: 'one', request_id: 'a' }
  const second = { request_id: 'b', visible: { wind: 3, rating: 4 }, fetched_at: 'two' }
  assert.deepEqual(canonicalVisible(first), canonicalVisible(second))
  assert.equal(contentDigest(first), contentDigest(second))
  assert.equal(contentDigest(first), contentDigest(first))
})

test("Today's Best preserves fuel/home selection and refetches visible winner detail", async () => {
  const current = settings([{ module: 'surf:1', w: 800, h: 480 }], {
    surf: [{ id: 1, spotId: '__todays_best__', spot: "Today's Best" }],
    surf_settings: { fuelPenalty: true, homeLat: 59.9, homeLon: 10.7 },
  })
  const seen = []
  const visible = await collectVisibleContent({ settings: current, deviceId, origin, authorization: 'Bearer token', fetchImpl: async (request) => {
    seen.push(request)
    if (seen.length === 1) return { ok: true, json: async () => ({ picked: { spotId: 'winner' }, rating: 2 }) }
    return { ok: true, json: async () => ({ spotId: 'winner', rating: 5, daily: [{ wave: 2 }], dayparts: [{ wind: 4 }] }) }
  } })
  assert.equal(seen.length, 2)
  assert.equal(seen[0].searchParams.get('fuelPenalty'), '1')
  assert.equal(seen[0].searchParams.get('homeLat'), '59.9')
  assert.equal(seen[0].searchParams.has('daily'), false)
  assert.equal(seen[1].searchParams.get('spotId'), 'winner')
  assert.equal(seen[1].searchParams.get('dayparts'), '1')
  assert.equal(seen[1].searchParams.get('daily'), '1')
  assert.equal(visible.sources['surf:1'].visible.rating, 5)
})

test('independent pipelines start concurrently while Surf detail waits for selection', async () => {
  const current = settings([{ module: 'surf:1', w: 800, h: 480 }, { module: 'weather:1' }], {
    surf: [{ id: 1, spotId: '__todays_best__', spot: "Today's Best" }],
  })
  const started = [], releases = new Map()
  const pending = collectVisibleContent({ settings: current, deviceId, origin, authorization: 'Bearer token', fetchImpl: (request) => {
    const kind = request.pathname.includes('weather') ? 'weather' : request.searchParams.get('spotId') === 'winner' ? 'detail' : 'selection'
    started.push(kind)
    return new Promise(resolve => releases.set(kind, () => resolve({ ok: true, json: async () => kind === 'selection' ? { picked: { spotId: 'winner' } } : { visible: kind } })))
  } })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(started.sort(), ['selection', 'weather'])
  releases.get('selection')(); await new Promise(resolve => setImmediate(resolve))
  assert.ok(started.includes('detail'))
  releases.get('weather')(); releases.get('detail')(); await pending
})
