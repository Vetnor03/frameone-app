import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [types, header, config, layout, renderer] = await Promise.all([
  read('frame/src/core/Types.h'),
  read('frame/src/core/FrameConfig.h'),
  read('frame/src/core/FrameConfig.cpp'),
  read('frame/src/core/Layout.cpp'),
  read('frame/src/modules/ModuleRenderer.cpp'),
])

const sizeFor = (w, h) => w === 4 && h === 1 ? 'SMALL'
  : w === 2 && h === 2 ? 'MEDIUM'
    : w === 4 && h === 2 ? 'LARGE' : w === 4 && h === 4 ? 'XL' : 'ADAPTIVE'

function stage(cells) {
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > 16) return null
  const occupied = Array.from({ length: 4 }, () => Array(4).fill(false))
  const slots = new Set()
  const staged = []
  for (const c of cells) {
    for (const key of ['slot', 'col', 'row', 'colSpan', 'rowSpan']) {
      if (!Number.isInteger(c[key])) return null
    }
    if (typeof c.module !== 'string' || c.module.length === 0 ||
        c.slot < 0 || c.slot > 15 || c.col < 0 || c.col > 3 || c.row < 0 || c.row > 3 ||
        c.colSpan < 1 || c.colSpan > 4 || c.rowSpan < 1 || c.rowSpan > 4 ||
        c.col + c.colSpan > 4 || c.row + c.rowSpan > 4 || slots.has(c.slot)) return null
    slots.add(c.slot)
    for (let y = c.row; y < c.row + c.rowSpan; y++) for (let x = c.col; x < c.col + c.colSpan; x++) {
      if (occupied[y][x]) return null
      occupied[y][x] = true
    }
    staged.push({ ...c, module: c.module.slice(0, 15), size: sizeFor(c.colSpan, c.rowSpan) })
  }
  if (occupied.some((row) => row.some((value) => !value))) return null
  return staged
}

const named = {
  full: [{ slot: 0, module: 'date', col: 0, row: 0, colSpan: 4, rowSpan: 4 }],
  default: [
    { slot: 0, module: 'date', col: 0, row: 0, colSpan: 4, rowSpan: 1 },
    { slot: 1, module: 'weather', col: 0, row: 1, colSpan: 4, rowSpan: 1 },
    { slot: 2, module: 'stocks', col: 0, row: 2, colSpan: 4, rowSpan: 2 },
  ],
  pyramid: [
    { slot: 0, module: 'date', col: 0, row: 0, colSpan: 4, rowSpan: 1 },
    { slot: 1, module: 'weather', col: 0, row: 1, colSpan: 4, rowSpan: 1 },
    { slot: 2, module: 'surf', col: 0, row: 2, colSpan: 2, rowSpan: 2 },
    { slot: 3, module: 'stocks', col: 2, row: 2, colSpan: 2, rowSpan: 2 },
  ],
  square: [0, 1, 2, 3].map((slot) => ({ slot, module: `module-${slot}`, col: (slot % 2) * 2,
    row: Math.floor(slot / 2) * 2, colSpan: 2, rowSpan: 2 })),
}
const singles = Array.from({ length: 16 }, (_, slot) => ({ slot, module: `module-${slot}`,
  col: slot % 4, row: Math.floor(slot / 4), colSpan: 1, rowSpan: 1 }))
const mixed = [
  { slot: 15, module: 'wide', col: 0, row: 0, colSpan: 3, rowSpan: 1 },
  { slot: 3, module: 'tall', col: 3, row: 0, colSpan: 1, rowSpan: 3 },
  { slot: 8, module: 'block', col: 0, row: 1, colSpan: 3, rowSpan: 2 },
  { slot: 12, module: 'bottom', col: 0, row: 3, colSpan: 4, rowSpan: 1 },
]

test('capacity is shared and fixed at 16 for named and custom resolution', () => {
  assert.match(types, /MAX_GRID_CELLS\s*=\s*16/)
  assert.match(header, /MAX_FRAME_ASSIGNMENTS\s*=\s*MAX_GRID_CELLS/)
  assert.match(header, /SlotModule assigns\[MAX_FRAME_ASSIGNMENTS\]/)
  assert.match(header, /GridLayout grid;[\s\S]*SlotModule assigns\[MAX_FRAME_ASSIGNMENTS\]/)
  assert.match(layout, /static Cell g_gridCellStaging\[MAX_GRID_CELLS\]/)
  assert.match(header, /LAYOUT_FULL,\s*LAYOUT_CUSTOM/)
})

test('custom intent is separate, fallback stays DEFAULT, and named parsing stays geometry-free', () => {
  assert.match(config, /customLayoutRequested = strcmp\(layoutStr, "custom"\) == 0/)
  assert.match(config, /out\.layout = parseLayout\(String\(layoutStr\)\)/)
  assert.match(config, /return LAYOUT_DEFAULT;/)
  assert.match(config, /if \(out\.customLayoutRequested\) \{[\s\S]*stageCustomLayout\(out, cells\);[\s\S]*\} else if \(!cells\.isNull\(\)\)/)
  const namedBranch = config.slice(config.indexOf('} else if (!cells.isNull())'), config.indexOf('// ===== modules.*'))
  assert.doesNotMatch(namedBranch, /colSpan|rowSpan|makeGridCell/)
})

test('valid legacy-equivalent, 16-cell, shuffled non-contiguous, and adaptive tilings stage', () => {
  for (const cells of Object.values(named)) assert.ok(stage(cells))
  assert.equal(stage(singles).length, 16)
  const shuffled = [mixed[2], mixed[0], mixed[3], mixed[1]]
  assert.deepEqual(stage(shuffled).map((c) => c.slot), [8, 15, 12, 3])
  assert.deepEqual(stage(shuffled).map((c) => c.size), ['ADAPTIVE', 'ADAPTIVE', 'SMALL', 'ADAPTIVE'])
})

test('malformed custom layouts fail atomically in the modeled firmware contract', () => {
  const invalid = [
    [], [...singles, singles[0]],
    [{ ...named.full[0], slot: -1 }], [{ ...named.full[0], col: -1 }],
    [{ ...named.full[0], row: 4 }], [{ ...named.full[0], colSpan: 0 }],
    [{ ...named.full[0], rowSpan: 5 }], [{ ...named.full[0], col: 1 }],
    [{ ...named.full[0], module: '' }], [{ ...named.full[0], slot: 0.5 }],
    [singles[0], { ...singles[1], col: 0, slot: 1 }], singles.slice(1),
    [singles[0], { ...singles[1], slot: 0 }, ...singles.slice(2)],
  ]
  for (const cells of invalid) assert.equal(stage(cells), null)
  assert.match(config, /GridCell candidateCells\[MAX_GRID_CELLS\]/)
  assert.match(config, /SlotModule candidateAssigns\[MAX_FRAME_ASSIGNMENTS\]/)
  assert.ok(config.indexOf('Layout::setGridLayout') < config.indexOf('out.customLayout.grid = candidateGrid'))
  assert.ok(config.indexOf('out.customLayout.grid = candidateGrid') < config.indexOf('out.customLayout.valid = true'))
})

test('signed validation precedes casts and firmware derives size without trusting JSON size', () => {
  assert.match(config, /int slot, col, row, colSpan, rowSpan;/)
  assert.match(config, /slot < 0[\s\S]*col < 0[\s\S]*row < 0[\s\S]*colSpan < 1[\s\S]*rowSpan < 1/)
  assert.ok(config.indexOf('slot < 0') < config.indexOf('(uint8_t)slot'))
  assert.match(config, /Layout::makeGridCell/)
  assert.doesNotMatch(config, /cell\["size"\]|c\["size"\]/)
})

test('custom state resets and adaptive geometry is capability-gated at runtime', () => {
  assert.match(config, /resetCustomLayout\(out\);/)
  assert.match(config, /customLayout\.grid\.count = 0[\s\S]*customLayout\.assignCount = 0[\s\S]*customLayout\.valid = false[\s\S]*customLayout\.renderable = false/)
  assert.match(layout, /ModuleRenderer::canRenderCell\(module, cell\)/)
  assert.match(layout, /ModuleRenderer::renderPlaceholders\(assigns, assignCount, cells, n\)/)
  assert.match(renderer, /cell\.size != CELL_ADAPTIVE[\s\S]*"date"/)
})

test('a realistic maximum payload remains comfortably within both existing 12 KiB limits', () => {
  const payload = JSON.stringify({ settings_json: { layout: 'custom', theme: 'dark', cells: singles } })
  assert.ok(Buffer.byteLength(payload) < 12288 / 2, `fixture uses ${Buffer.byteLength(payload)} bytes`)
  assert.match(config, /FRAME_CONFIG_MAX_BODY_BYTES = 12288/)
  assert.match(config, /FRAME_CONFIG_JSON_CAPACITY = 12288/)
})
