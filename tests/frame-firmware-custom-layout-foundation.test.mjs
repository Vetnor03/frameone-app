import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [types, header, source, generated, frameHeader, frameSource] = await Promise.all([
  read('frame/src/core/Types.h'),
  read('frame/src/core/Layout.h'),
  read('frame/src/core/Layout.cpp'),
  read('frame/src/core/GeneratedLayouts.h'),
  read('frame/src/core/FrameConfig.h'),
  read('frame/src/core/FrameConfig.cpp'),
])

const A = 'CELL_ADAPTIVE'
const sizeFor = (w, h) => {
  if (w === 4 && h === 1) return 'CELL_SMALL'
  if (w === 2 && h === 2) return 'CELL_MEDIUM'
  if (w === 4 && h === 2) return 'CELL_LARGE'
  if (w === 4 && h === 4) return 'CELL_XL'
  return A
}
const cell = (col, row, colSpan, rowSpan, slot, size = sizeFor(colSpan, rowSpan)) =>
  ({ col, row, colSpan, rowSpan, slot, size })

function valid(cells) {
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > 16) return false
  const occupied = Array(16).fill(false)
  const slots = new Set()
  for (const c of cells) {
    if (c.col < 0 || c.col >= 4 || c.row < 0 || c.row >= 4 ||
        c.colSpan < 1 || c.rowSpan < 1 || c.col + c.colSpan > 4 || c.row + c.rowSpan > 4 ||
        c.slot < 0 || c.slot > 15 || slots.has(c.slot) || c.size !== sizeFor(c.colSpan, c.rowSpan)) return false
    slots.add(c.slot)
    for (let y = c.row; y < c.row + c.rowSpan; y += 1) {
      for (let x = c.col; x < c.col + c.colSpan; x += 1) {
        const i = y * 4 + x
        if (occupied[i]) return false
        occupied[i] = true
      }
    }
  }
  return occupied.every(Boolean)
}

function named(name) {
  const body = generated.match(new RegExp(`static const GridCell ${name}\\[\\] = \\{([\\s\\S]*?)\\n\\};`))?.[1]
  assert.ok(body)
  return [...body.matchAll(/\{(\d+), (\d+), (\d+), (\d+), (\d+), (CELL_\w+)\}/g)]
    .map((m) => cell(...m.slice(1, 6).map(Number), m[6]))
}

const singles = Array.from({ length: 16 }, (_, i) => cell(i % 4, Math.floor(i / 4), 1, 1, i))
const mixed = [
  cell(0, 0, 1, 4, 8),
  cell(1, 0, 3, 2, 3),
  cell(1, 2, 2, 1, 12),
  cell(3, 2, 1, 2, 0),
  cell(1, 3, 2, 1, 15),
]

test('CellSize appends adaptive and GridLayout has exact fixed capacity', () => {
  assert.match(types, /enum CellSize\s*\{\s*CELL_SMALL,\s*CELL_MEDIUM,\s*CELL_LARGE,\s*CELL_XL,\s*CELL_ADAPTIVE\s*\}/)
  assert.match(types, /static const uint8_t MAX_GRID_CELLS = 16;/)
  assert.match(types, /struct GridLayout\s*\{\s*GridCell cells\[MAX_GRID_CELLS\];\s*uint8_t count = 0;/)
})

test('geometry mapping keeps exactly four handmade anchors', () => {
  const anchors = new Map([['4x1', 'CELL_SMALL'], ['2x2', 'CELL_MEDIUM'], ['4x2', 'CELL_LARGE'], ['4x4', 'CELL_XL']])
  for (let w = 1; w <= 4; w += 1) for (let h = 1; h <= 4; h += 1) {
    assert.equal(sizeFor(w, h), anchors.get(`${w}x${h}`) ?? A)
  }
  assert.match(source, /colSpan == 4 && rowSpan == 1[\s\S]*colSpan == 2 && rowSpan == 2[\s\S]*colSpan == 4 && rowSpan == 2[\s\S]*colSpan == 4 && rowSpan == 4[\s\S]*return CELL_ADAPTIVE;/)
  assert.match(source, /GridCell makeGridCell[\s\S]*cellSizeForGeometry\(colSpan, rowSpan\)/)
})

test('named and arbitrary complete tilings validate', () => {
  for (const name of ['FULL', 'DEFAULT', 'PYRAMID', 'SQUARE']) {
    const cells = named(name)
    assert.equal(valid(cells), true, name)
    assert.equal(cells.some((c) => c.size === A), false, name)
  }
  assert.equal(valid(singles), true)
  assert.equal(singles.every((c) => c.size === A), true)
  assert.equal(valid(mixed), true)
  assert.ok(mixed.filter((c) => c.size === A).length >= 4)
})

test('whole-layout validation rejects every malformed class', () => {
  assert.equal(valid([]), false, 'count zero')
  assert.equal(valid([...singles, cell(0, 0, 1, 1, 16)]), false, 'count 17')
  for (const bad of [
    [cell(4, 0, 1, 4, 0)], [cell(0, 4, 4, 1, 0)],
    [cell(0, 0, 0, 4, 0)], [cell(0, 0, 4, 0, 0)], [cell(1, 0, 4, 4, 0)],
  ]) assert.equal(valid(bad), false)
  assert.equal(valid([...singles.slice(0, 15), cell(0, 0, 1, 1, 15)]), false, 'overlap plus hole, area 16')
  assert.equal(valid(singles.slice(0, 15)), false, 'edge hole')
  assert.equal(valid(singles.filter((_, i) => i !== 5)), false, 'disconnected hole')
  const duplicate = singles.map((c) => ({ ...c })); duplicate[15].slot = 0
  assert.equal(valid(duplicate), false, 'duplicate slot')
  const highSlot = singles.map((c) => ({ ...c })); highSlot[15].slot = 16
  assert.equal(valid(highSlot), false, 'slot over 15')
  assert.equal(valid([cell(0, 0, 4, 4, 0, 'CELL_SMALL')]), false, 'legacy mismatch')
  assert.equal(valid([cell(0, 0, 4, 4, 0, A)]), false, 'anchor tagged adaptive')
  const adaptiveMismatch = mixed.map((c) => ({ ...c })); adaptiveMismatch[1].size = 'CELL_MEDIUM'
  assert.equal(valid(adaptiveMismatch), false, 'adaptive mismatch')
})

test('firmware validator checks bounds, slots, size semantics, overlap, and complete occupancy', () => {
  assert.match(header, /bool validateGridLayout\(const GridCell\* cells, int count\);/)
  assert.match(source, /count < 1 \|\| count > MAX_GRID_CELLS/)
  assert.match(source, /cell\.slot >= MAX_GRID_CELLS/)
  assert.match(source, /cell\.size != cellSizeForGeometry/)
  assert.match(source, /if \(usedSlots & slotMask\) return false;/)
  assert.match(source, /if \(occupied\[row\]\[col\]\) return false;/)
  assert.match(source, /if \(!occupied\[row\]\[col\]\) return false;/)
})

test('setter validates first and therefore leaves destination unchanged on failure', () => {
  const setter = source.match(/bool setGridLayout\([\s\S]*?\n\}/)?.[0]
  assert.ok(setter)
  assert.match(setter, /^bool setGridLayout[\s\S]*if \(!validateGridLayout\(source, count\)\) return false;/)
  assert.ok(setter.indexOf('validateGridLayout') < setter.indexOf('destination.cells'))
  const destination = { cells: [...mixed], count: mixed.length }
  const before = structuredClone(destination)
  const set = (candidate) => valid(candidate) ? Object.assign(destination, { cells: [...candidate], count: candidate.length }) && true : false
  assert.equal(set(singles), true); assert.deepEqual(destination, { cells: singles, count: 16 })
  const accepted = structuredClone(destination)
  assert.equal(set(singles.slice(1)), false); assert.deepEqual(destination, accepted)
  assert.notDeepEqual(destination, before)
})

test('Phase B remains unreachable from active rendering and config paths', () => {
  const build = source.match(/int buildCells\([\s\S]*?\n\}/)?.[0]
  assert.deepEqual([...build.matchAll(/GeneratedLayouts::(FULL|DEFAULT|PYRAMID|SQUARE)(?!_COUNT)/g)].map((m) => m[1]),
    ['SQUARE', 'FULL', 'DEFAULT', 'PYRAMID'])
  assert.doesNotMatch(build, /GridLayout|ADAPTIVE|CUSTOM/)
  // D1 intentionally raises the historical capacity of 8 to the full 4x4 maximum.
  assert.match(source, /Cell cells\[MAX_GRID_CELLS\];/)
  assert.match(frameHeader, /SlotModule assigns\[MAX_FRAME_ASSIGNMENTS\];/)
  assert.doesNotMatch(frameSource, /LAYOUT_CUSTOM/)
  assert.match(frameSource, /return LAYOUT_DEFAULT;\s*\}/)
})
