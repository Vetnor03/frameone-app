/** Reusable, deterministic 4x4 rectangular-partition editor. */
export const GRID_SIZE = 4
export const MIN_STROKE_PX = 8

export const cellArea = cell => cell.colSpan * cell.rowSpan
export const sortCells = cells => [...cells].sort((a, b) => a.row - b.row || a.col - b.col || a.rowSpan - b.rowSpan || a.colSpan - b.colSpan || a.id.localeCompare(b.id))
export const detectOrientation = stroke => Math.abs(stroke.end.x - stroke.start.x) > Math.abs(stroke.end.y - stroke.start.y) ? 'horizontal' : 'vertical'
export const snapBoundary = (value, extent) => Math.max(0, Math.min(GRID_SIZE, Math.round(value / extent * GRID_SIZE)))

export function hasOverlap(a, b) {
  return a.col < b.col + b.colSpan && a.col + a.colSpan > b.col && a.row < b.row + b.rowSpan && a.row + a.rowSpan > b.row
}

export function validateLayout(cells) {
  if (!cells.length || new Set(cells.map(c => c.id)).size !== cells.length) return false
  if (cells.some(c => !Number.isInteger(c.col) || !Number.isInteger(c.row) || !Number.isInteger(c.colSpan) || !Number.isInteger(c.rowSpan) || c.col < 0 || c.row < 0 || c.colSpan < 1 || c.rowSpan < 1 || c.col + c.colSpan > GRID_SIZE || c.row + c.rowSpan > GRID_SIZE)) return false
  if (cells.some((a, i) => cells.slice(i + 1).some(b => hasOverlap(a, b)))) return false
  if (cells.reduce((area, c) => area + cellArea(c), 0) !== GRID_SIZE * GRID_SIZE) return false
  return Array.from({length: GRID_SIZE}, (_, row) => Array.from({length: GRID_SIZE}, (_, col) => cells.filter(c => col >= c.col && col < c.col + c.colSpan && row >= c.row && row < c.row + c.rowSpan).length)).flat().every(n => n === 1)
}

/** Return each internal shared edge once, merging adjacent collinear units. */
export function internalDividerSegments(cells) {
  if (!validateLayout(cells)) return []
  const owner = (col, row) => cells.find(c => col >= c.col && col < c.col + c.colSpan && row >= c.row && row < c.row + c.rowSpan)?.id
  const units = []
  for (let boundary = 1; boundary < GRID_SIZE; boundary++) for (let row = 0; row < GRID_SIZE; row++) {
    if (owner(boundary - 1, row) !== owner(boundary, row)) units.push({axis: 'vertical', boundary, from: row, to: row + 1})
  }
  for (let boundary = 1; boundary < GRID_SIZE; boundary++) for (let col = 0; col < GRID_SIZE; col++) {
    if (owner(col, boundary - 1) !== owner(col, boundary)) units.push({axis: 'horizontal', boundary, from: col, to: col + 1})
  }
  return units.reduce((segments, unit) => {
    const previous = segments.at(-1)
    if (previous && previous.axis === unit.axis && previous.boundary === unit.boundary && previous.to === unit.from) previous.to = unit.to
    else segments.push({...unit})
    return segments
  }, [])
}

export function findContainingCell(cells, point) {
  return sortCells(cells).find(c => point.x >= c.col && point.x <= c.col + c.colSpan && point.y >= c.row && point.y <= c.row + c.rowSpan)
}

export function chooseNearestEdge(cell, orientation, boundary) {
  if (orientation === 'vertical') return boundary - cell.col <= cell.col + cell.colSpan - boundary ? 'left' : 'right'
  return boundary - cell.row <= cell.row + cell.rowSpan - boundary ? 'top' : 'bottom'
}

const child = (parent, geometry, suffix) => ({...geometry, id: `${parent.id}/${suffix}`, moduleId: 'empty'})

export function partitionCell(parent, normalized) {
  const {orientation, boundary, rangeStart, rangeEnd, nearestEdge} = normalized
  const pieces = []
  let intended
  if (orientation === 'vertical') {
    const stripCol = nearestEdge === 'left' ? parent.col : boundary
    const stripSpan = nearestEdge === 'left' ? boundary - parent.col : parent.col + parent.colSpan - boundary
    const other = nearestEdge === 'left'
      ? {col: boundary, row: parent.row, colSpan: parent.col + parent.colSpan - boundary, rowSpan: parent.rowSpan}
      : {col: parent.col, row: parent.row, colSpan: boundary - parent.col, rowSpan: parent.rowSpan}
    pieces.push(child(parent, other, 'remainder'))
    if (rangeStart > parent.row) pieces.push(child(parent, {col: stripCol, row: parent.row, colSpan: stripSpan, rowSpan: rangeStart - parent.row}, 'before'))
    intended = child(parent, {col: stripCol, row: rangeStart, colSpan: stripSpan, rowSpan: rangeEnd - rangeStart}, 'cell')
    pieces.push(intended)
    if (rangeEnd < parent.row + parent.rowSpan) pieces.push(child(parent, {col: stripCol, row: rangeEnd, colSpan: stripSpan, rowSpan: parent.row + parent.rowSpan - rangeEnd}, 'after'))
  } else {
    const stripRow = nearestEdge === 'top' ? parent.row : boundary
    const stripSpan = nearestEdge === 'top' ? boundary - parent.row : parent.row + parent.rowSpan - boundary
    const other = nearestEdge === 'top'
      ? {col: parent.col, row: boundary, colSpan: parent.colSpan, rowSpan: parent.row + parent.rowSpan - boundary}
      : {col: parent.col, row: parent.row, colSpan: parent.colSpan, rowSpan: boundary - parent.row}
    pieces.push(child(parent, other, 'remainder'))
    if (rangeStart > parent.col) pieces.push(child(parent, {col: parent.col, row: stripRow, colSpan: rangeStart - parent.col, rowSpan: stripSpan}, 'before'))
    intended = child(parent, {col: rangeStart, row: stripRow, colSpan: rangeEnd - rangeStart, rowSpan: stripSpan}, 'cell')
    pieces.push(intended)
    if (rangeEnd < parent.col + parent.colSpan) pieces.push(child(parent, {col: rangeEnd, row: stripRow, colSpan: parent.col + parent.colSpan - rangeEnd, rowSpan: stripSpan}, 'after'))
  }
  if (parent.moduleId && parent.moduleId !== 'empty') {
    const keeper = [...pieces].sort((a, b) => cellArea(b) - cellArea(a) || a.row - b.row || a.col - b.col)[0]
    keeper.moduleId = parent.moduleId
  }
  return {pieces: sortCells(pieces), intendedId: intended.id}
}

export function previewStroke(cells, stroke, viewport = {width: 785, height: 458}) {
  const length = Math.hypot(stroke.end.x - stroke.start.x, stroke.end.y - stroke.start.y)
  if (length < MIN_STROKE_PX) return {valid: false, reason: 'Draw a longer line', cells}
  if ([stroke.start, stroke.end].some(p => p.x < 0 || p.y < 0 || p.x > viewport.width || p.y > viewport.height)) return {valid: false, reason: 'Keep the line inside the viewport', cells}
  const orientation = detectOrientation(stroke)
  const midpoint = {x: (stroke.start.x + stroke.end.x) / 2 / viewport.width * GRID_SIZE, y: (stroke.start.y + stroke.end.y) / 2 / viewport.height * GRID_SIZE}
  const parent = findContainingCell(cells, midpoint)
  if (!parent) return {valid: false, reason: 'No cell contains this line', cells}
  const boundary = orientation === 'vertical' ? snapBoundary((stroke.start.x + stroke.end.x) / 2, viewport.width) : snapBoundary((stroke.start.y + stroke.end.y) / 2, viewport.height)
  const rawStart = orientation === 'vertical' ? snapBoundary(Math.min(stroke.start.y, stroke.end.y), viewport.height) : snapBoundary(Math.min(stroke.start.x, stroke.end.x), viewport.width)
  const rawEnd = orientation === 'vertical' ? snapBoundary(Math.max(stroke.start.y, stroke.end.y), viewport.height) : snapBoundary(Math.max(stroke.start.x, stroke.end.x), viewport.width)
  const low = orientation === 'vertical' ? parent.row : parent.col
  const high = orientation === 'vertical' ? parent.row + parent.rowSpan : parent.col + parent.colSpan
  const rangeStart = Math.max(low, rawStart), rangeEnd = Math.min(high, rawEnd)
  const boundaryLow = orientation === 'vertical' ? parent.col : parent.row
  const boundaryHigh = orientation === 'vertical' ? parent.col + parent.colSpan : parent.row + parent.rowSpan
  if (boundary <= boundaryLow || boundary >= boundaryHigh || rangeStart >= rangeEnd) return {valid: false, reason: 'That line does not create a new rectangle', cells}
  const nearestEdge = chooseNearestEdge(parent, orientation, boundary)
  const normalized = {orientation, boundary, rangeStart, rangeEnd, nearestEdge}
  const {pieces, intendedId} = partitionCell(parent, normalized)
  const next = sortCells(cells.filter(c => c.id !== parent.id).concat(pieces))
  if (!validateLayout(next)) return {valid: false, reason: 'The proposed partition is invalid', cells}
  return {valid: true, cells: next, parentId: parent.id, intendedId, normalized}
}

/** Synchronous pointer-up entrypoint; callers must pass the actual release point. */
export const finalizeStroke = (cells, start, end, viewport) => previewStroke(cells, {start, end}, viewport)

export const commitPreview = (cells, preview) => preview.valid ? preview.cells : cells
export const initialLayout = () => [{id: 'cell', col: 0, row: 0, colSpan: 4, rowSpan: 4, moduleId: 'empty'}]

export function createHistory(initial = initialLayout()) { return {past: [], present: initial, future: []} }
export function pushHistory(history, next) { return next === history.present ? history : {past: [...history.past, history.present], present: next, future: []} }
export function undoHistory(history) { return history.past.length ? {past: history.past.slice(0, -1), present: history.past.at(-1), future: [history.present, ...history.future]} : history }
export function redoHistory(history) { return history.future.length ? {past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1)} : history }
