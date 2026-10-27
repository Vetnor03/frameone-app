import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const readText = path => readFileSync(new URL(path, root), 'utf8')
const readJson = path => JSON.parse(readText(path))
const spec = readJson('shared/frame-layouts.json')

const frozenSurfBlobs = Object.freeze({
  'frame/src/modules/ModuleSurf.cpp': '8651d398727c817e514a667edd0f5b9ea002a455',
  'frame/src/modules/ModuleSurf.h': '8d9d6224dab2850f0eebe74a2de895845bd0174a',
  'frame/src/modules/SurfAdaptivePolicy.h': '9a8b29e6671916d90bfa5ef1142b6c24d1e12492',
  'app/lib/surfResponsive.mjs': 'fabaee92bf3de7ce2761f18fdc4bfbf82756d11f',
})

const builtIns = {
  full: [[0, 0, 4, 4, 0, 'XL']],
  default: [[0, 0, 4, 1, 0, 'SMALL'], [0, 1, 4, 1, 1, 'SMALL'], [0, 2, 4, 2, 2, 'LARGE']],
  pyramid: [[0, 0, 4, 1, 0, 'SMALL'], [0, 1, 4, 1, 1, 'SMALL'], [0, 2, 2, 2, 2, 'MEDIUM'], [2, 2, 2, 2, 3, 'MEDIUM']],
  square: [[0, 0, 2, 2, 0, 'MEDIUM'], [2, 0, 2, 2, 1, 'MEDIUM'], [0, 2, 2, 2, 2, 'MEDIUM'], [2, 2, 2, 2, 3, 'MEDIUM']],
}

const activePyramid = [
  { slot: 0, module: 'date', col: 0, row: 0, colSpan: 4, rowSpan: 1 },
  { slot: 1, module: 'news', col: 0, row: 1, colSpan: 4, rowSpan: 1 },
  { slot: 2, module: 'reminders', col: 0, row: 2, colSpan: 2, rowSpan: 2 },
  { slot: 3, module: 'weather:1', col: 2, row: 2, colSpan: 2, rowSpan: 2 },
]

// Phase 0 reproducer for draft PR #1423's randomEditorialReviewGrid(20261027, 4).
// Do not claim that an SVG/browser screenshot is an approved firmware golden.
const labReviewSeed = {
  seed: 20261027,
  density: 4,
  cells: [
    { slot: 0, module: 'date', col: 0, row: 0, colSpan: 4, rowSpan: 2 },
    { slot: 1, module: 'countdown', col: 0, row: 2, colSpan: 2, rowSpan: 2 },
    { slot: 2, module: 'stocks', col: 2, row: 2, colSpan: 1, rowSpan: 2 },
    { slot: 3, module: 'groceries', col: 3, row: 2, colSpan: 1, rowSpan: 2 },
  ],
}

function assertTiling(cells) {
  assert.ok(cells.length >= 1 && cells.length <= 16)
  const filled = new Set()
  const slots = new Set()
  for (const cell of cells) {
    assert.ok(Number.isInteger(cell.slot) && cell.slot >= 0 && cell.slot < 16)
    assert.ok(!slots.has(cell.slot), 'duplicate slot')
    slots.add(cell.slot)
    for (const key of ['col', 'row', 'colSpan', 'rowSpan']) assert.ok(Number.isInteger(cell[key]))
    assert.ok(cell.col >= 0 && cell.row >= 0 && cell.colSpan > 0 && cell.rowSpan > 0)
    assert.ok(cell.col + cell.colSpan <= 4 && cell.row + cell.rowSpan <= 4)
    for (let y = cell.row; y < cell.row + cell.rowSpan; y++) {
      for (let x = cell.col; x < cell.col + cell.colSpan; x++) {
        const key = x + ',' + y
        assert.ok(!filled.has(key), 'overlapping cells')
        filled.add(key)
      }
    }
  }
  assert.equal(filled.size, 16, 'every 4x4 square must be assigned once')
}

const pixelBox = c => [
  Math.trunc(spec.viewport.width * c.col / spec.gridSize),
  Math.trunc(spec.viewport.height * c.row / spec.gridSize),
  Math.trunc(spec.viewport.width * (c.col + c.colSpan) / spec.gridSize) - Math.trunc(spec.viewport.width * c.col / spec.gridSize),
  Math.trunc(spec.viewport.height * (c.row + c.rowSpan) / spec.gridSize) - Math.trunc(spec.viewport.height * c.row / spec.gridSize),
]

test('Phase 0: panel / 4x4 geometry / four frozen built-in presets', () => {
  assert.deepEqual(spec.panel, { width: 800, height: 480 })
  assert.deepEqual(spec.viewport, { x: 0, y: 0, width: 800, height: 480 })
  assert.equal(spec.gridSize, 4)
  assert.deepEqual(Object.keys(spec.layouts).sort(), Object.keys(builtIns).sort())
  for (const [name, expected] of Object.entries(builtIns)) {
    const cells = spec.layouts[name]
    assertTiling(cells)
    assert.deepEqual(cells.map(c => [c.col, c.row, c.colSpan, c.rowSpan, c.slot, c.size]), expected)
  }
})

test('Phase 0: Pyramid Dark fixture preserves Date / News / Reminders / Weather:1', () => {
  assertTiling(activePyramid)
  assert.deepEqual(activePyramid.map(pixelBox), [
    [0, 0, 800, 120], [0, 120, 800, 120], [0, 240, 400, 240], [400, 240, 400, 240],
  ])
  assert.deepEqual(activePyramid.map(c => [c.col, c.row, c.colSpan, c.rowSpan, c.slot]),
    spec.layouts.pyramid.map(c => [c.col, c.row, c.colSpan, c.rowSpan, c.slot]))
  assert.deepEqual(spec.dividers.pyramid, [
    { axis: 'y', boundary: 1, span: 'viewport95' },
    { axis: 'y', boundary: 2, span: 'viewport95' },
    { axis: 'x', boundary: 2, span: 'region95', fromBoundary: 2, toBoundary: 4 },
  ])
})

test('Phase 0: seeded 4-cell Layout Lab review case is a valid custom grid', () => {
  assert.equal(labReviewSeed.seed, 20261027)
  assert.equal(labReviewSeed.density, labReviewSeed.cells.length)
  assertTiling(labReviewSeed.cells)
  assert.deepEqual(labReviewSeed.cells.map(pixelBox), [
    [0, 0, 800, 240], [0, 240, 400, 240], [400, 240, 200, 240], [600, 240, 200, 240],
  ])
})

test('Phase 0: baseline physical module geometry capability is explicit, not physical approval', () => {
  const custom = readText('app/lib/customLayouts.mjs')
  const physical = readText('frame/src/modules/AdaptiveModuleCapability.h')
  const layout = readText('frame/src/core/Layout.cpp')
  assert.match(custom, /SUPPORTED_PHYSICAL_GEOMETRIES/)
  assert.match(custom, /ADAPTIVE_DATE_GEOMETRIES/)
  assert.match(custom, /validateCustomGeometry/)
  assert.match(physical, /numericInstance\(module, "surf"\)/)
  assert.match(layout, /prepareCustomRender/)
  assert.match(layout, /LAYOUT_DEFAULT/)
})

test('Phase 0: Surf source fingerprints match the untouched 2026-10-27 baseline', () => {
  for (const [path, expectedBlobSha] of Object.entries(frozenSurfBlobs)) {
    const bytes = readFileSync(new URL(path, root))
    const blobSha = createHash('sha1')
      .update(Buffer.from('blob ' + bytes.length + '\0'))
      .update(bytes)
      .digest('hex')
    assert.equal(blobSha, expectedBlobSha, path + ' differs from locked Surf source baseline')
  }
  const profiles = readJson('shared/module-layout-profiles.json')
  assert.deepEqual(profiles.surf.small.ratingVisual, [134, 18])
  assert.deepEqual(profiles.surf.medium.ratingVisual, [134, 18])
  assert.deepEqual(profiles.surf.large.ratingVisual, [110, 18])
  assert.deepEqual(profiles.surf.xl.ratingVisual, [134, 18])
})

test('Phase 0: current font sources are inventoried, not silently replaced by Lab mockups', () => {
  for (const path of [
    'frame/src/assets/fonts/FreeSans9ptNO.h',
    'frame/src/assets/fonts/FreeSans12ptNO.h',
    'frame/src/assets/fonts/FreeSansBold12ptNO.h',
    'frame/src/assets/fonts/FreeSansBold18ptNO.h',
  ]) assert.match(readText(path), /0x20, 0xFF/, path)
  assert.match(readText('frame/src/display/FrameText.cpp'), /normalizeUtf8ForDisplay/)
  assert.match(readText('frame/src/modules/ModuleDate.cpp'), /FreeSansBold24pt7b\.h/)
})
