import test from 'node:test'
import assert from 'node:assert/strict'
import { buildContentRequestPlan, physicalModuleDeadlines, physicalRenderDigest, physicalRenderProjection } from '../app/lib/device/contentSignature.mjs'
import { supportsPhysicalCustomCell } from '../app/lib/customLayouts.mjs'

const cell = { slot: 0, module: 'ski:1', col: 0, row: 0, colSpan: 2, rowSpan: 2, w: 400, h: 240, size: 'MEDIUM' }
const settings = {
  theme: 'dark',
  language: 'en',
  layout: 'custom',
  cells: [cell],
  modules: { ski: [{ id: 1, label: 'Hovden', lat: 59.5602, lon: 7.3568 }] },
}
const source = {
  module_id: 1,
  language: 'en',
  location: { label: 'Hovden' },
  current: { temp_c: -5.7, wind_mps: 6.6, wind_dir_deg: 269 },
  snow: { fresh_24h_cm: 18.2, snow_depth_cm: 73.8 },
  avalanche: { available: true, assessed: true, danger_level: 3 },
  resort: { available: true, name: 'Hovden', resort_open: true, ski_open: true, lifts_open: 7, lifts_total: 8 },
  next_powder_day: { found: true, display_date: 'Fri 25 Sep', estimated_fresh_cm_low: 12, estimated_fresh_cm_high: 18 },
}

test('Ski frame content plan uses the normalized device Ski adapter', () => {
  const plan = buildContentRequestPlan({ settings, deviceId: 'frm_test', origin: 'https://re-mind.no' })
  assert.deepEqual([...plan.refs.keys()], ['ski:1'])
  assert.equal(plan.requests.length, 1)
  assert.equal(plan.requests[0].key, 'ski:1')
  assert.equal(plan.requests[0].url.pathname, '/api/device/ski-frame')
  assert.equal(plan.requests[0].url.searchParams.get('device_id'), 'frm_test')
  assert.equal(plan.requests[0].url.searchParams.get('id'), '1')
})

test('Ski 2x2 projection contains only visible rounded output', () => {
  const projected = physicalRenderProjection('ski:1', source, cell, { theme: 'dark' })
  assert.deepEqual(projected.visible, {
    location: 'HOVDEN',
    freshCm: 18,
    totalCm: 74,
    tempC: -6,
    windMps: 7,
    windDir: 6,
    avalanche: 3,
  })
})

test('Ski smart-refresh ignores invisible data and small background noise', () => {
  const first = physicalRenderDigest('ski:1', source, cell, { theme: 'dark' })
  const sameSignificance = physicalRenderDigest('ski:1', {
    ...source,
    generated_at: '2099-01-01T00:00:00Z',
    current: { ...source.current, temp_c: -5.1, wind_mps: 6.9 },
    snow: { ...source.snow, fresh_24h_cm: 18.9, snow_depth_cm: 78.9 },
    resort: { ...source.resort, lifts_open: 2 },
  }, cell, { theme: 'dark' })
  assert.equal(first, sameSignificance)

  const meaningfulSnow = physicalRenderDigest('ski:1', {
    ...source,
    snow: { ...source.snow, fresh_24h_cm: 20.1 },
  }, cell, { theme: 'dark' })
  assert.notEqual(first, meaningfulSnow)
})

test('Avalanche danger 0 is projected as Not assessed, never safe', () => {
  const projected = physicalRenderProjection('ski:1', {
    ...source,
    avalanche: { available: true, assessed: false, danger_level: 0 },
  }, cell, { theme: 'dark' })
  assert.equal(projected.visible.avalanche, 'not_assessed')
  assert.equal(JSON.stringify(projected).toLowerCase().includes('safe'), false)
})

test('larger Ski cells add resort and Next Powder Day only when physically visible', () => {
  const large = { ...cell, colSpan: 2, rowSpan: 3, w: 400, h: 360, size: 'ADAPTIVE' }
  const projected = physicalRenderProjection('ski:1', source, large, { theme: 'dark' })
  assert.deepEqual(projected.visible.resort, {
    available: true,
    name: 'Hovden',
    open: true,
    liftsOpen: 7,
    liftsTotal: 8,
  })
  assert.deepEqual(projected.visible.nextPowder, {
    found: true,
    date: 'Fri 25 Sep',
    lowCm: 12,
    highCm: 18,
    midCm: null,
  })
  assert.equal(physicalRenderProjection('ski:1', source, cell, { theme: 'dark' }).visible.resort, undefined)
})

test('Ski source checks are multi-hour and Power Save has no fast polling fallback', () => {
  const now = Date.parse('2026-09-24T12:00:00Z')
  const normal = physicalModuleDeadlines({ settings, sources: { 'ski:1': source }, now })
  const saver = physicalModuleDeadlines({ settings: { ...settings, powerSaver: true }, sources: { 'ski:1': source }, now })
  assert.equal(normal['ski:1'][0].at, now + 3 * 60 * 60_000)
  assert.equal(saver['ski:1'][0].at, now + 3 * 60 * 60_000)
  assert.equal(normal['ski:1'][0].reason, 'source_freshness')
})

test('Ski physical custom capability supports adaptive geometries', () => {
  for (const [colSpan, rowSpan] of [[1, 1], [1, 2], [1, 4], [2, 2], [2, 3], [3, 2], [4, 1], [4, 2], [4, 4]]) {
    assert.equal(supportsPhysicalCustomCell({ ...cell, colSpan, rowSpan }), true)
  }
  assert.equal(supportsPhysicalCustomCell({ ...cell, module: 'ski:5' }), false)
})
