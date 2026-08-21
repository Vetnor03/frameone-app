import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [types, header, source, generated, contractText, configHeader, configSource] = await Promise.all([
  read('frame/src/core/Types.h'), read('frame/src/core/Layout.h'),
  read('frame/src/core/Layout.cpp'), read('frame/src/core/GeneratedLayouts.h'),
  read('shared/frame-layouts.json'), read('frame/src/core/FrameConfig.h'),
  read('frame/src/core/FrameConfig.cpp'),
])
const contract = JSON.parse(contractText)

const sizeFor = (w, h) => w === 4 && h === 1 ? 'CELL_SMALL'
  : w === 2 && h === 2 ? 'CELL_MEDIUM' : w === 4 && h === 2 ? 'CELL_LARGE'
    : w === 4 && h === 4 ? 'CELL_XL' : 'CELL_ADAPTIVE'
const cell = (col, row, colSpan, rowSpan, slot, size = sizeFor(colSpan, rowSpan)) =>
  ({ col, row, colSpan, rowSpan, slot, size })
function named(name) {
  const body = generated.match(new RegExp(`static const GridCell ${name}\\[\\] = \\{([\\s\\S]*?)\\n\\};`))?.[1]
  assert.ok(body)
  return [...body.matchAll(/\{(\d+), (\d+), (\d+), (\d+), (\d+), (CELL_\w+)\}/g)]
    .map((m) => cell(...m.slice(1, 6).map(Number), m[6]))
}
function valid(cells) {
  if (cells.length < 1 || cells.length > 16) return false
  const owner = Array.from({ length: 4 }, () => Array(4).fill(-1)); const slots = new Set()
  for (const [i, c] of cells.entries()) {
    if (c.col < 0 || c.row < 0 || c.colSpan < 1 || c.rowSpan < 1 || c.col + c.colSpan > 4 ||
        c.row + c.rowSpan > 4 || c.slot < 0 || c.slot > 15 || slots.has(c.slot) ||
        c.size !== sizeFor(c.colSpan, c.rowSpan)) return false
    slots.add(c.slot)
    for (let y = c.row; y < c.row + c.rowSpan; y++) for (let x = c.col; x < c.col + c.colSpan; x++) {
      if (owner[y][x] !== -1) return false
      owner[y][x] = i
    }
  }
  return owner.every((row) => row.every((value) => value !== -1))
}
function derive(cells) {
  if (!valid(cells)) return null
  const owner = Array.from({ length: 4 }, () => Array(4))
  cells.forEach((c, i) => {
    for (let y = c.row; y < c.row + c.rowSpan; y++) for (let x = c.col; x < c.col + c.colSpan; x++) owner[y][x] = i
  })
  const result = []
  for (const axis of ['H', 'V']) for (let boundary = 1; boundary < 4; boundary++) {
    const divided = Array.from({ length: 4 }, (_, p) => axis === 'H'
      ? owner[boundary - 1][p] !== owner[boundary][p]
      : owner[p][boundary - 1] !== owner[p][boundary])
    for (let from = 0; from < 4;) {
      if (!divided[from]) { from++; continue }
      let to = from + 1; while (to < 4 && divided[to]) to++
      result.push([axis, boundary, from, to]); from = to
    }
  }
  return result
}
const grid = (start, length, boundary) => start + Math.trunc(length * boundary / 4)
function resolve([axis, boundary, from, to]) {
  const horizontal = axis === 'H'; const start = horizontal
    ? grid(9, 785, from) : grid(22, 458, from)
  const end = horizontal ? grid(9, 785, to) : grid(22, 458, to)
  const margin = Math.trunc((end - start) * 0.025)
  return horizontal ? [start + margin, grid(22, 458, boundary), end - margin, grid(22, 458, boundary)]
    : [grid(9, 785, boundary), start + margin, grid(9, 785, boundary), end - margin]
}

const expected = {
  FULL: [], DEFAULT: [['H', 1, 0, 4], ['H', 2, 0, 4]],
  PYRAMID: [['H', 1, 0, 4], ['H', 2, 0, 4], ['V', 2, 2, 4]],
  SQUARE: [['H', 2, 0, 4], ['V', 2, 0, 4]],
}
const expectedPixels = {
  FULL: [], DEFAULT: [[28, 136, 775, 136], [28, 251, 775, 251]],
  PYRAMID: [[28, 136, 775, 136], [28, 251, 775, 251], [401, 256, 401, 475]],
  SQUARE: [[28, 251, 775, 251], [401, 33, 401, 469]],
}

test('divider types are allocation-free and bounded by all 24 internal unit edges', () => {
  assert.match(types, /enum GridDividerAxis\s*\{\s*DIVIDER_HORIZONTAL,\s*DIVIDER_VERTICAL/)
  assert.match(types, /static const uint8_t MAX_GRID_DIVIDERS = 24;/)
  assert.match(types, /GridDivider dividers\[MAX_GRID_DIVIDERS\];/)
  assert.doesNotMatch(types + header + source, /std::vector|\bnew\b|malloc\s*\(/)
  assert.match(header, /bool deriveGridDividers\(GridDividerLayout& destination, const GridLayout& layout\);/)
})

test('named layouts derive deterministic logical and pixel-exact legacy dividers', () => {
  for (const name of Object.keys(expected)) {
    const logical = derive(named(name))
    assert.deepEqual(logical, expected[name], `${name} logical`)
    assert.deepEqual(logical.map(resolve), expectedPixels[name], `${name} pixels`)
  }
  assert.deepEqual(contract.dividers.full, [])
})

test('sixteen unit cells merge to six maximal runs with no outer border', () => {
  const singles = Array.from({ length: 16 }, (_, i) => cell(i % 4, Math.floor(i / 4), 1, 1, i))
  assert.deepEqual(derive(singles), [
    ['H', 1, 0, 4], ['H', 2, 0, 4], ['H', 3, 0, 4],
    ['V', 1, 0, 4], ['V', 2, 0, 4], ['V', 3, 0, 4],
  ])
})

test('spanning cells suppress internal edges and fragmented runs do not bridge gaps', () => {
  // Boundary 2 is divided at columns 0,1 and 3, but a 1x4 cell spans it at column 2.
  const fragmented = [cell(2, 0, 1, 4, 0), cell(0, 0, 2, 2, 1), cell(0, 2, 2, 2, 2),
    cell(3, 0, 1, 2, 3), cell(3, 2, 1, 2, 4)]
  const result = derive(fragmented)
  assert.deepEqual(result.filter((d) => d[0] === 'H' && d[1] === 2),
    [['H', 2, 0, 2], ['H', 2, 3, 4]])
  assert.equal(result.some((d) => d[0] === 'H' && d[2] <= 2 && d[3] > 2), false)
  // These complete tilings respectively contain 4x2 and 3x2 spanning rectangles.
  assert.equal(derive([cell(0, 0, 4, 2, 0), cell(0, 2, 4, 2, 1)])
    .some((d) => d[0] === 'V'), false)
  const threeByTwo = [cell(0, 0, 3, 2, 0), cell(3, 0, 1, 2, 1), cell(0, 2, 4, 2, 2)]
  assert.equal(derive(threeByTwo).some((d) => d[0] === 'V' && d[1] < 3 && d[2] < 2), false)
})

test('topology ignores input order, slot values, and valid CellSize labels', () => {
  const geometry = [cell(2, 0, 1, 4, 4), cell(0, 0, 2, 2, 3), cell(0, 2, 2, 2, 2),
    cell(3, 0, 1, 2, 1), cell(3, 2, 1, 2, 0)]
  const shuffled = [geometry[3], geometry[1], geometry[4], geometry[0], geometry[2]]
  const slotsChanged = geometry.map((c, i) => ({ ...c, slot: 10 + i }))
  assert.deepEqual(derive(shuffled), derive(geometry))
  assert.deepEqual(derive(slotsChanged), derive(geometry))
  assert.doesNotMatch(source.match(/bool deriveGridDividers[\s\S]*?\n\}/)?.[0] ?? '', /\.slot|\.size|CELL_/)
})

test('invalid derivation is validate-first and atomic for every malformed class', () => {
  const fn = source.match(/bool deriveGridDividers[\s\S]*?\n\}/)?.[0]; assert.ok(fn)
  assert.ok(fn.indexOf('validateGridLayout') < fn.indexOf('GridDividerLayout derived'))
  assert.ok(fn.indexOf('destination = derived') > fn.indexOf('GridDividerLayout derived'))
  const singles = Array.from({ length: 16 }, (_, i) => cell(i % 4, Math.floor(i / 4), 1, 1, i))
  const badSize = singles.map((c) => ({ ...c })); badSize[0].size = 'CELL_SMALL'
  const duplicate = singles.map((c) => ({ ...c })); duplicate[1].slot = 0
  const overlap = singles.map((c) => ({ ...c })); overlap[15] = cell(0, 0, 1, 1, 15)
  for (const candidate of [[], singles.slice(0, 15), [...singles, cell(0, 0, 1, 1, 16)],
    [cell(0, 0, 5, 4, 0)], overlap, duplicate, badSize]) assert.equal(derive(candidate), null)
})

test('partial regions use their own 2.5% truncating margin', () => {
  assert.deepEqual(resolve(['H', 1, 0, 2]), [18, 136, 392, 136])
  assert.deepEqual(resolve(['V', 2, 1, 3]), [401, 141, 401, 360])
  assert.match(source, /span95\(start, end - start, resolved\.x0, resolved\.x1\)/)
  assert.match(source, /span95\(start, end - start, resolved\.y0, resolved\.y1\)/)
})

test('Phase C remains disconnected from runtime drawing and configuration', () => {
  const draw = source.match(/void draw\(LayoutKey key\)[\s\S]*?\n\}/)?.[0]
  const content = source.match(/void drawWithContent\(LayoutKey key[\s\S]*?\n\}/)?.[0]
  const build = source.match(/int buildCells\(LayoutKey key[\s\S]*?\n\}/)?.[0]
  for (const fn of [draw, content, build]) assert.doesNotMatch(fn, /deriveGridDividers|resolveGridDivider/)
  assert.match(draw, /LAYOUT_DEFAULT[\s\S]*drawHLine[\s\S]*LAYOUT_PYRAMID[\s\S]*drawVLine[\s\S]*LAYOUT_SQUARE/)
  assert.match(content, /Cell cells\[8\];/)
  assert.match(configHeader, /SlotModule assigns\[8\];/)
  assert.deepEqual([...build.matchAll(/GeneratedLayouts::(FULL|DEFAULT|PYRAMID|SQUARE)(?!_COUNT)/g)].map((m) => m[1]),
    ['SQUARE', 'FULL', 'DEFAULT', 'PYRAMID'])
  assert.doesNotMatch(configSource + configHeader, /LAYOUT_CUSTOM|GridLayout|colSpan|rowSpan/)
  assert.match(configSource, /return LAYOUT_DEFAULT;\s*\}/)
})
