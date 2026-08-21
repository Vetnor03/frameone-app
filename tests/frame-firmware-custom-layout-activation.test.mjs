import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [header, source, config, generated] = await Promise.all([
  read('frame/src/core/FrameConfig.h'), read('frame/src/core/Layout.cpp'),
  read('frame/src/core/FrameConfig.cpp'), read('frame/src/core/GeneratedLayouts.h'),
])
const sizeFor = (w, h) => w === 4 && h === 1 ? 'CELL_SMALL' : w === 2 && h === 2
  ? 'CELL_MEDIUM' : w === 4 && h === 2 ? 'CELL_LARGE' : w === 4 && h === 4 ? 'CELL_XL' : 'CELL_ADAPTIVE'
const cell = (col, row, colSpan, rowSpan, slot) => ({ col, row, colSpan, rowSpan, slot, size: sizeFor(colSpan, rowSpan) })
function named(name) {
  const body = generated.match(new RegExp(`static const GridCell LAYOUT_${name}_CELLS\\[\\] = \\{([\\s\\S]*?)\\n\\};`))[1]
  return [...body.matchAll(/\{(\d+), (\d+), (\d+), (\d+), (\d+), (CELL_\w+)\}/g)]
    .map((m) => ({ col: +m[1], row: +m[2], colSpan: +m[3], rowSpan: +m[4], slot: +m[5], size: m[6] }))
}
function valid(cells) {
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > 16) return false
  const owner = Array(16).fill(-1); const slots = new Set()
  for (const [i, c] of cells.entries()) {
    if (c.col < 0 || c.row < 0 || c.colSpan < 1 || c.rowSpan < 1 || c.col + c.colSpan > 4 ||
        c.row + c.rowSpan > 4 || c.slot < 0 || c.slot > 15 || slots.has(c.slot) ||
        c.size !== sizeFor(c.colSpan, c.rowSpan)) return false
    slots.add(c.slot)
    for (let y = c.row; y < c.row + c.rowSpan; y++) for (let x = c.col; x < c.col + c.colSpan; x++) {
      const p = y * 4 + x; if (owner[p] !== -1) return false; owner[p] = i
    }
  }
  return owner.every((v) => v !== -1)
}
const renderable = (cells) => valid(cells) && cells.every((c) => c.size !== 'CELL_ADAPTIVE')
const boundary = (start, length, n) => start + Math.trunc(length * n / 4)
const resolvedCells = (cells) => cells.map((c) => [boundary(9, 785, c.col), boundary(22, 458, c.row),
  boundary(9, 785, c.col + c.colSpan) - boundary(9, 785, c.col),
  boundary(22, 458, c.row + c.rowSpan) - boundary(22, 458, c.row), c.slot, c.size])
function dividers(cells) {
  const owner = Array.from({ length: 4 }, () => Array(4))
  cells.forEach((c, i) => { for (let y = c.row; y < c.row + c.rowSpan; y++) for (let x = c.col; x < c.col + c.colSpan; x++) owner[y][x] = i })
  const out = []
  for (const axis of ['H', 'V']) for (let b = 1; b < 4; b++) for (let from = 0; from < 4;) {
    const split = (p) => axis === 'H' ? owner[b - 1][p] !== owner[b][p] : owner[p][b - 1] !== owner[p][b]
    if (!split(from)) { from++; continue }
    let to = from + 1; while (to < 4 && split(to)) to++
    out.push([axis, b, from, to]); from = to
  }
  return out
}
const pixels = (ds) => ds.map(([axis, b, from, to]) => {
  const h = axis === 'H'; const start = boundary(h ? 9 : 22, h ? 785 : 458, from)
  const end = boundary(h ? 9 : 22, h ? 785 : 458, to); const m = Math.trunc((end - start) * .025)
  return h ? [start + m, boundary(22, 458, b), end - m, boundary(22, 458, b)]
    : [boundary(9, 785, b), start + m, boundary(9, 785, b), end - m]
})
const fourRows = [0, 1, 2, 3].map((row) => cell(0, row, 4, 1, [0, 3, 8, 12][row]))
const twoLarge = [cell(0, 0, 4, 2, 0), cell(0, 2, 4, 2, 12)]
const singles = Array.from({ length: 16 }, (_, i) => cell(i % 4, Math.floor(i / 4), 1, 1, i))
const mixed = [cell(0, 0, 4, 1, 0), cell(0, 1, 2, 1, 3), cell(2, 1, 2, 1, 8), cell(0, 2, 4, 2, 12)]

test('custom is appended and named parsing cannot activate it directly', () => {
  assert.match(header, /LAYOUT_DEFAULT,\s*LAYOUT_PYRAMID,\s*LAYOUT_SQUARE,\s*LAYOUT_FULL,\s*LAYOUT_CUSTOM/)
  assert.doesNotMatch(config.match(/static LayoutKey parseLayout[\s\S]*?\n\}/)[0], /custom|LAYOUT_CUSTOM/)
  assert.match(config, /customLayout\.valid && out\.customLayout\.renderable[\s\S]*LAYOUT_CUSTOM/)
})
test('validity remains distinct from D2 renderability', () => {
  assert.equal(valid(singles), true); assert.equal(renderable(singles), false)
  assert.equal(valid(mixed), true); assert.equal(renderable(mixed), false)
  assert.equal(valid(singles.slice(1)), false); assert.equal(renderable(singles.slice(1)), false)
  assert.match(header, /bool valid = false;\s*bool renderable = false;/)
})
test('custom FULL, DEFAULT, PYRAMID, and SQUARE have exact legacy pixels', () => {
  const expected = { FULL: [], DEFAULT: [[28,136,775,136],[28,251,775,251]],
    PYRAMID: [[28,136,775,136],[28,251,775,251],[401,256,401,475]],
    SQUARE: [[28,251,775,251],[401,33,401,469]] }
  for (const name of Object.keys(expected)) {
    const cells = named(name); assert.equal(renderable(cells), true)
    assert.deepEqual(resolvedCells(cells), resolvedCells(named(name)))
    assert.deepEqual(pixels(dividers(cells)), expected[name])
  }
})
test('new four-row and two-large anchor layouts activate with exact dividers', () => {
  assert.equal(renderable(fourRows), true)
  assert.deepEqual(dividers(fourRows), [['H',1,0,4],['H',2,0,4],['H',3,0,4]])
  assert.equal(resolvedCells(fourRows).every((c) => c[5] === 'CELL_SMALL'), true)
  assert.equal(renderable(twoLarge), true); assert.deepEqual(dividers(twoLarge), [['H',2,0,4]])
})
test('non-contiguous slots and shuffled geometry are deterministic by slot', () => {
  const shuffled = [fourRows[2], fourRows[0], fourRows[3], fourRows[1]]
  const bySlot = (cells) => resolvedCells(cells).sort((a, b) => a[4] - b[4])
  assert.deepEqual(bySlot(shuffled), bySlot(fourRows)); assert.deepEqual(dividers(shuffled), dividers(fourRows))
  assert.deepEqual(fourRows.map((c) => c.slot), [0, 3, 8, 12])
})
test('preflight is atomic, blocks adaptive cells, and routes assignments safely', () => {
  const resolver = source.match(/bool buildGridCells[\s\S]*?\n\}/)[0]
  const preflight = source.match(/static bool prepareCustomRender[\s\S]*?\n\}/)[0]
  assert.ok(resolver.indexOf('g_gridCellStaging') < resolver.indexOf('outCells[i] = staged[i]'))
  assert.match(preflight, /buildGridCells[\s\S]*deriveGridDividers[\s\S]*resolveGridDivider[\s\S]*output = staged/)
  assert.match(preflight, /CELL_ADAPTIVE/)
  assert.match(source, /customReady \? cfg\.customLayout\.assigns : cfg\.assigns/)
  assert.match(source, /key == LAYOUT_CUSTOM && !customReady \? LAYOUT_DEFAULT : key/)
})
test('D2 render workspaces cannot regress onto loopTask stack', () => {
  const preflight = source.match(/static bool prepareCustomRender[\s\S]*?\n\}/)[0]
  const draw = source.match(/void drawWithContent[\s\S]*?\n\}/)[0]
  assert.match(source, /static RenderWorkspace g_renderWorkspace;/)
  assert.doesNotMatch(draw, /CustomRenderPlan\s+customPlan\s*;/)
  assert.doesNotMatch(draw, /Cell\s+namedCells\s*\[MAX_GRID_CELLS\]/)
  assert.doesNotMatch(preflight, /CustomRenderPlan\s+staged\s*;/)
  assert.match(draw, /CustomRenderPlan& customPlan = g_renderWorkspace\.prepared/)
  assert.match(preflight, /CustomRenderPlan& staged = g_renderWorkspace\.staging/)
})
test('named build/dividers remain isolated and key-only custom drawing defaults', () => {
  const build = source.match(/int buildCells[\s\S]*?\n\}/)[0]
  assert.deepEqual([...build.matchAll(/GeneratedLayouts::LAYOUT_(FULL|DEFAULT|PYRAMID|SQUARE)_CELLS/g)].map((m) => m[1]), ['SQUARE','FULL','DEFAULT','PYRAMID'])
  assert.doesNotMatch(build, /custom|GridLayout/)
  const draw = source.match(/void draw\(LayoutKey key\)[\s\S]*?\n\}/)[0]
  assert.match(draw, /if \(key == LAYOUT_CUSTOM\) key = LAYOUT_DEFAULT/)
  assert.doesNotMatch(draw, /deriveGridDividers/)
})
