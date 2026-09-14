import test from 'node:test'
import assert from 'node:assert/strict'
import { buildContentRequestPlan, physicalRenderDigest, physicalRenderProjection } from '../app/lib/device/contentSignature.mjs'
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
  location: { label: 'Hovden' },
  current: { temp_c: -5.7, wind_mps: 6.6, wind_dir_deg: 269 },
  snow: { fresh_24h_cm: 18.2, snow_depth_cm: 73.8 },
  avalanche: { available: true, assessed: true, danger_level: 3 },
}

test('Ski frame content plan uses the normalized device Ski adapter', () => {
  const plan = buildContentRequestPlan({ settings, deviceId: 'frm_test', origin: 'https://re-mind.no' })
  assert.deepEqual([...plan.refs.keys()], ['ski:1'])
  assert.equal(plan.requests.length, 1)
  assert.equal(plan.requests[0].key, 'ski:1')
  assert.equal(plan.requests[0].url.pathname, '/api/device/ski-frame')
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

test('Ski smart-refresh ignores invisible/raw changes and same displayed rounding', () => {
  const first = physicalRenderDigest('ski:1', source, cell, { theme: 'dark' })
  const sameVisible = physicalRenderDigest('ski:1', {
    ...source,
    generated_at: '2099-01-01T00:00:00Z',
    snow: { ...source.snow, fresh_24h_cm: 18.4 },
    resort: { lifts_open: 2 },
  }, cell, { theme: 'dark' })
  assert.equal(first, sameVisible)

  const changedVisible = physicalRenderDigest('ski:1', {
    ...source,
    snow: { ...source.snow, fresh_24h_cm: 18.6 },
  }, cell, { theme: 'dark' })
  assert.notEqual(first, changedVisible)
})

test('Avalanche danger 0 is projected as Not assessed, never safe', () => {
  const projected = physicalRenderProjection('ski:1', {
    ...source,
    avalanche: { available: true, assessed: false, danger_level: 0 },
  }, cell, { theme: 'dark' })
  assert.equal(projected.visible.avalanche, 'not_assessed')
  assert.equal(JSON.stringify(projected).toLowerCase().includes('safe'), false)
})

test('Ski physical custom capability is deliberately limited to the 2x2 reference', () => {
  assert.equal(supportsPhysicalCustomCell({ ...cell, colSpan: 2, rowSpan: 2 }), true)
  for (const [colSpan, rowSpan] of [[1, 1], [4, 1], [4, 2], [4, 4], [3, 3]]) {
    assert.equal(supportsPhysicalCustomCell({ ...cell, colSpan, rowSpan }), false)
  }
})
