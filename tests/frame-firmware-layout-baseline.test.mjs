import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

const [contractText, configSource, generatedSource, layoutSource, frameConfigHeader, frameConfigSource] =
  await Promise.all([
    read('shared/frame-layouts.json'),
    read('frame/src/core/Config.h'),
    read('frame/src/core/GeneratedLayouts.h'),
    read('frame/src/core/Layout.cpp'),
    read('frame/src/core/FrameConfig.h'),
    read('frame/src/core/FrameConfig.cpp'),
  ])

const contract = JSON.parse(contractText)
const layoutNames = ['full', 'default', 'pyramid', 'square']
const sizeConstant = {
  SMALL: 'CELL_SMALL',
  MEDIUM: 'CELL_MEDIUM',
  LARGE: 'CELL_LARGE',
  XL: 'CELL_XL',
}

// Deliberately duplicated known-good production geometry: changing the contract
// must not silently redefine this physical-frame baseline.
const expectedLayouts = {
  full: [[0, 0, 4, 4, 0, 'CELL_XL']],
  default: [
    [0, 0, 4, 1, 0, 'CELL_SMALL'],
    [0, 1, 4, 1, 1, 'CELL_SMALL'],
    [0, 2, 4, 2, 2, 'CELL_LARGE'],
  ],
  pyramid: [
    [0, 0, 4, 1, 0, 'CELL_SMALL'],
    [0, 1, 4, 1, 1, 'CELL_SMALL'],
    [0, 2, 2, 2, 2, 'CELL_MEDIUM'],
    [2, 2, 2, 2, 3, 'CELL_MEDIUM'],
  ],
  square: [
    [0, 0, 2, 2, 0, 'CELL_MEDIUM'],
    [2, 0, 2, 2, 1, 'CELL_MEDIUM'],
    [0, 2, 2, 2, 2, 'CELL_MEDIUM'],
    [2, 2, 2, 2, 3, 'CELL_MEDIUM'],
  ],
}

const expectedRects = {
  full: [[9, 22, 785, 458, 0, 'CELL_XL']],
  default: [
    [9, 22, 785, 114, 0, 'CELL_SMALL'],
    [9, 136, 785, 115, 1, 'CELL_SMALL'],
    [9, 251, 785, 229, 2, 'CELL_LARGE'],
  ],
  pyramid: [
    [9, 22, 785, 114, 0, 'CELL_SMALL'],
    [9, 136, 785, 115, 1, 'CELL_SMALL'],
    [9, 251, 392, 229, 2, 'CELL_MEDIUM'],
    [401, 251, 393, 229, 3, 'CELL_MEDIUM'],
  ],
  square: [
    [9, 22, 392, 229, 0, 'CELL_MEDIUM'],
    [401, 22, 393, 229, 1, 'CELL_MEDIUM'],
    [9, 251, 392, 229, 2, 'CELL_MEDIUM'],
    [401, 251, 393, 229, 3, 'CELL_MEDIUM'],
  ],
}

const expectedDividers = {
  full: [],
  default: [
    { axis: 'y', boundary: 1, span: 'viewport95' },
    { axis: 'y', boundary: 2, span: 'viewport95' },
  ],
  pyramid: [
    { axis: 'y', boundary: 1, span: 'viewport95' },
    { axis: 'y', boundary: 2, span: 'viewport95' },
    { axis: 'x', boundary: 2, span: 'region95', fromBoundary: 2, toBoundary: 4 },
  ],
  square: [
    { axis: 'y', boundary: 2, span: 'viewport95' },
    { axis: 'x', boundary: 2, span: 'viewport95' },
  ],
}

const expectedResolvedDividers = {
  full: [],
  default: [
    { axis: 'y', coordinate: 136, from: 28, to: 775 },
    { axis: 'y', coordinate: 251, from: 28, to: 775 },
  ],
  pyramid: [
    { axis: 'y', coordinate: 136, from: 28, to: 775 },
    { axis: 'y', coordinate: 251, from: 28, to: 775 },
    { axis: 'x', coordinate: 401, from: 256, to: 475 },
  ],
  square: [
    { axis: 'y', coordinate: 251, from: 28, to: 775 },
    { axis: 'x', coordinate: 401, from: 33, to: 469 },
  ],
}

function configInteger(name) {
  const match = configSource.match(new RegExp(`static\\s+const\\s+int\\s+${name}\\s*=\\s*(\\d+)\\s*;`))
  assert.ok(match, `${name} must remain an integer constant in Config.h`)
  return Number(match[1])
}

function tuples(cells) {
  return cells.map(({ col, row, colSpan, rowSpan, slot, size }) =>
    [col, row, colSpan, rowSpan, slot, sizeConstant[size]])
}

function parseGeneratedLayout(name) {
  const id = name.toUpperCase()
  const body = generatedSource.match(
    new RegExp(`static\\s+const\\s+GridCell\\s+${id}\\[\\]\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`),
  )
  assert.ok(body, `GeneratedLayouts::${id} must exist`)
  return [...body[1].matchAll(
    /\{\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(CELL_(?:SMALL|MEDIUM|LARGE|XL))\s*\}/g,
  )].map((match) => [...match.slice(1, 6).map(Number), match[6]])
}

const truncate = (value) => Math.trunc(value)
const gridBoundary = (start, length, boundary) =>
  start + truncate((length * boundary) / contract.gridSize)

function resolveCell([col, row, colSpan, rowSpan, slot, size]) {
  const x0 = gridBoundary(contract.viewport.x, contract.viewport.width, col)
  const y0 = gridBoundary(contract.viewport.y, contract.viewport.height, row)
  const x1 = gridBoundary(contract.viewport.x, contract.viewport.width, col + colSpan)
  const y1 = gridBoundary(contract.viewport.y, contract.viewport.height, row + rowSpan)
  return [x0, y0, x1 - x0, y1 - y0, slot, size]
}

function span95(start, length) {
  // Mirrors C++ conversion to int after multiplying by 0.025: truncate, don't round.
  const margin = truncate(length * 0.025)
  return [start + margin, start + length - margin]
}

function resolveDivider(divider) {
  const { x, y, width, height } = contract.viewport
  if (divider.axis === 'y') {
    return {
      axis: 'y',
      coordinate: gridBoundary(y, height, divider.boundary),
      from: span95(x, width)[0],
      to: span95(x, width)[1],
    }
  }
  const regionStart = divider.span === 'region95'
    ? gridBoundary(y, height, divider.fromBoundary)
    : y
  const regionEnd = divider.span === 'region95'
    ? gridBoundary(y, height, divider.toBoundary)
    : y + height
  const [from, to] = span95(regionStart, regionEnd - regionStart)
  return {
    axis: 'x',
    coordinate: gridBoundary(x, width, divider.boundary),
    from,
    to,
  }
}

function assertValidTiling(name, cells) {
  const grid = Array.from({ length: contract.gridSize }, () =>
    Array(contract.gridSize).fill(0))
  const slots = new Set()
  let area = 0

  for (const [index, cell] of cells.entries()) {
    const [col, row, colSpan, rowSpan, slot] = cell
    assert.ok(col >= 0 && col < contract.gridSize, `${name}[${index}] col is in bounds`)
    assert.ok(row >= 0 && row < contract.gridSize, `${name}[${index}] row is in bounds`)
    assert.ok(colSpan >= 1 && rowSpan >= 1, `${name}[${index}] spans are positive`)
    assert.ok(col + colSpan <= contract.gridSize, `${name}[${index}] width stays in bounds`)
    assert.ok(row + rowSpan <= contract.gridSize, `${name}[${index}] height stays in bounds`)
    assert.equal(slots.has(slot), false, `${name}[${index}] slot ${slot} is unique`)
    assert.equal(slot, index, `${name}[${index}] retains generated slot order`)
    slots.add(slot)
    area += colSpan * rowSpan

    for (let y = row; y < row + rowSpan; y += 1) {
      for (let x = col; x < col + colSpan; x += 1) {
        grid[y][x] += 1
        assert.equal(grid[y][x], 1, `${name} does not overlap at ${x},${y}`)
      }
    }
  }

  assert.equal(area, 16, `${name} has logical area 16`)
  assert.deepEqual(grid, Array.from({ length: 4 }, () => Array(4).fill(1)),
    `${name} covers every grid unit exactly once without holes`)
  assert.deepEqual([...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]), cells,
    `${name} order is top-to-bottom, then left-to-right`)
}

test('panel, calibrated viewport, and 4x4 grid are frozen and Config.h matches', () => {
  assert.deepEqual(contract.panel, { width: 800, height: 480 })
  assert.deepEqual(contract.viewport, { x: 9, y: 22, width: 785, height: 458 })
  assert.equal(contract.gridSize, 4)
  assert.deepEqual({
    x: configInteger('VIEWPORT_X'),
    y: configInteger('VIEWPORT_Y'),
    width: configInteger('VIEWPORT_W'),
    height: configInteger('VIEWPORT_H'),
  }, contract.viewport)
  assert.match(layoutSource, /int gridX\(uint8_t boundary\) \{ return VIEWPORT_X \+ \(VIEWPORT_W \* \(int\)boundary\) \/ GRID_SIZE; \}/)
  assert.match(layoutSource, /int gridY\(uint8_t boundary\) \{ return VIEWPORT_Y \+ \(VIEWPORT_H \* \(int\)boundary\) \/ GRID_SIZE; \}/)
})

test('shared and generated named layouts match the exact production baseline', () => {
  assert.deepEqual(Object.keys(contract.layouts), layoutNames)
  assert.match(generatedSource, /^\/\/ Generated by scripts\/generate-frame-layouts\.mjs\. Do not edit\./)
  for (const name of layoutNames) {
    const shared = tuples(contract.layouts[name])
    assert.deepEqual(shared, expectedLayouts[name], `${name} shared geometry is exact`)
    assert.deepEqual(parseGeneratedLayout(name), shared,
      `${name} generated fields, sizes, slots, and ordering match shared JSON`)
    assert.match(generatedSource, new RegExp(
      `static\\s+const\\s+int\\s+${name.toUpperCase()}_COUNT\\s*=\\s*sizeof\\(${name.toUpperCase()}\\)\\s*\\/\\s*sizeof\\(${name.toUpperCase()}\\[0\\]\\);`,
    ))
  }
})

test('integer grid boundaries and every resolved physical cell rectangle are exact', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((boundary) =>
    gridBoundary(contract.viewport.x, contract.viewport.width, boundary)),
  [9, 205, 401, 597, 794])
  assert.deepEqual([0, 1, 2, 3, 4].map((boundary) =>
    gridBoundary(contract.viewport.y, contract.viewport.height, boundary)),
  [22, 136, 251, 365, 480])
  for (const name of layoutNames) {
    assert.deepEqual(expectedLayouts[name].map(resolveCell), expectedRects[name], `${name} pixels are exact`)
  }
})

test('every named layout is an ordered, complete, non-overlapping 4x4 tiling', () => {
  for (const name of layoutNames) assertValidTiling(name, tuples(contract.layouts[name]))
})

test('divider definitions, integer coordinates, and 95% truncation are exact', () => {
  assert.deepEqual(contract.dividers, expectedDividers)
  assert.deepEqual(span95(9, 785), [28, 775])
  assert.deepEqual(span95(22, 458), [33, 469])
  assert.deepEqual(span95(251, 229), [256, 475])
  for (const name of layoutNames) {
    assert.deepEqual(contract.dividers[name].map(resolveDivider), expectedResolvedDividers[name],
      `${name} divider pixels are exact`)
  }
  assert.equal(contract.dividers.full.length, 0)
  assert.match(layoutSource, /int margin = \(int\)\(length \* 0\.025f\);/)
})

test('named layout selection and fallback behavior remain frozen', () => {
  const buildCells = layoutSource.match(/int buildCells\([\s\S]*?\n\}/)?.[0]
  assert.ok(buildCells, 'Layout::buildCells source exists')
  assert.deepEqual([...buildCells.matchAll(/GeneratedLayouts::(FULL|DEFAULT|PYRAMID|SQUARE)(?!_COUNT)/g)]
    .map((match) => match[1]), ['SQUARE', 'FULL', 'DEFAULT', 'PYRAMID'])
  assert.match(buildCells, /const GridCell\* source = GeneratedLayouts::SQUARE;/)
  assert.match(buildCells, /int sourceCount = GeneratedLayouts::SQUARE_COUNT;/)

  const parseLayout = frameConfigSource.match(/static LayoutKey parseLayout\([\s\S]*?\n\}/)?.[0]
  assert.ok(parseLayout, 'parseLayout source exists')
  assert.deepEqual([...parseLayout.matchAll(/if \(s == "([^"]+)"\)\s+return (LAYOUT_\w+);/g)]
    .map((match) => match.slice(1)), [
    ['default', 'LAYOUT_DEFAULT'],
    ['pyramid', 'LAYOUT_PYRAMID'],
    ['square', 'LAYOUT_SQUARE'],
    ['full', 'LAYOUT_FULL'],
  ])
  assert.match(parseLayout, /return LAYOUT_DEFAULT;\s*\}$/)
})

test('D1 expands only resource capacity from the historical eight-cell baseline', () => {
  // Phase A froze 8. D1 deliberately expands to the full 4x4 maximum of 16;
  // all geometry, divider, ordering, and named-layout assertions above stay frozen.
  assert.match(frameConfigHeader, /MAX_FRAME_ASSIGNMENTS\s*=\s*MAX_GRID_CELLS/)
  assert.match(frameConfigHeader, /SlotModule\s+assigns\[MAX_FRAME_ASSIGNMENTS\]\s*;/)
  assert.match(layoutSource, /Cell\s+cells\[MAX_GRID_CELLS\]\s*;/)
  assert.match(layoutSource, /buildCells\(key, cells, MAX_GRID_CELLS\)/)
})
