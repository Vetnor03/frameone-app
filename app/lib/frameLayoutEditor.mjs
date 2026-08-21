/** Reusable, deterministic 4x4 rectangular-partition editor. */
export const GRID_SIZE = 4
export const MIN_STROKE_PX = 8

export const cellArea = cell => cell.colSpan * cell.rowSpan
export const sortCells = cells => [...cells].sort((a, b) => a.row - b.row || a.col - b.col || a.rowSpan - b.rowSpan || a.colSpan - b.colSpan || a.id.localeCompare(b.id))
export const detectOrientation = stroke => Math.abs(stroke.end.x - stroke.start.x) > Math.abs(stroke.end.y - stroke.start.y) ? 'horizontal' : 'vertical'
export const snapBoundary = (value, extent) => Math.max(0, Math.min(GRID_SIZE, Math.round(value / extent * GRID_SIZE)))

const touchedRangeBoundary = (value, extent, direction) => Math.max(0, Math.min(GRID_SIZE, Math[direction](value / extent * GRID_SIZE)))

/** Lock the cross-axis interpretation once a divider drag becomes meaningful. */
export function resolveDividerStrokeLock(stroke, viewport = {width: 785, height: 458}) {
  if (Math.hypot(stroke.end.x - stroke.start.x, stroke.end.y - stroke.start.y) < MIN_STROKE_PX) return undefined
  const orientation = detectOrientation(stroke), vertical = orientation === 'vertical'
  const snapped = snapBoundary(vertical ? (stroke.start.x + stroke.end.x) / 2 : (stroke.start.y + stroke.end.y) / 2, vertical ? viewport.width : viewport.height)
  if (snapped <= 0 || snapped >= GRID_SIZE) return undefined
  return {orientation, boundary: snapped}
}

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

/** Return divider portions whose two owners can be replaced by one rectangle. */
export function removableDividerSegments(cells) {
  if (!validateLayout(cells)) return []
  const segments = []
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const a = cells[i], b = cells[j]
    const aModule = a.moduleId && a.moduleId !== 'empty' ? a.moduleId : 'empty'
    const bModule = b.moduleId && b.moduleId !== 'empty' ? b.moduleId : 'empty'
    if (aModule !== 'empty' && bModule !== 'empty' && aModule !== bModule) continue
    if (a.row === b.row && a.rowSpan === b.rowSpan) {
      const left = a.col < b.col ? a : b, right = left === a ? b : a
      if (left.col + left.colSpan === right.col) segments.push({axis: 'vertical', boundary: right.col, from: a.row, to: a.row + a.rowSpan, cellIds: [left.id, right.id]})
    }
    if (a.col === b.col && a.colSpan === b.colSpan) {
      const top = a.row < b.row ? a : b, bottom = top === a ? b : a
      if (top.row + top.rowSpan === bottom.row) segments.push({axis: 'horizontal', boundary: bottom.row, from: a.col, to: a.col + a.colSpan, cellIds: [top.id, bottom.id]})
    }
  }
  return segments.sort((a, b) => a.axis.localeCompare(b.axis) || a.boundary - b.boundary || a.from - b.from || a.cellIds[0].localeCompare(b.cellIds[0]))
}

/** Hit-test removable divider segments in viewport-local pixel coordinates. */
export function findDividerNearPointer(cells, point, viewport = {width: 785, height: 458}, tolerance = 10) {
  const candidates = removableDividerSegments(cells).map(segment => {
    const vertical = segment.axis === 'vertical'
    const fixed = segment.boundary / GRID_SIZE * (vertical ? viewport.width : viewport.height)
    const along = vertical ? point.y : point.x
    const cross = vertical ? point.x : point.y
    const extent = vertical ? viewport.height : viewport.width
    const start = segment.from / GRID_SIZE * extent, end = segment.to / GRID_SIZE * extent
    const nearestAlong = Math.max(start, Math.min(end, along))
    return {...segment, distance: Math.hypot(cross - fixed, along - nearestAlong)}
  }).filter(candidate => candidate.distance <= tolerance)
  return candidates.sort((a, b) => a.distance - b.distance || (a.to - a.from) - (b.to - b.from) || a.cellIds.join().localeCompare(b.cellIds.join()))[0]
}

const assignedModule = cell => cell.moduleId && cell.moduleId !== 'empty' ? cell.moduleId : 'empty'

/** Find the closest 4x4 boundary crossing a cell's interior (vertical wins ties). */
export function nearestValidSplitGuide(cell, point, viewport = {width: 785, height: 458}) {
  if (!cell) return undefined
  const guides = []
  for (let boundary = cell.col + 1; boundary < cell.col + cell.colSpan; boundary++) guides.push({axis: 'vertical', boundary, distance: Math.abs(point.x - boundary / GRID_SIZE * viewport.width)})
  for (let boundary = cell.row + 1; boundary < cell.row + cell.rowSpan; boundary++) guides.push({axis: 'horizontal', boundary, distance: Math.abs(point.y - boundary / GRID_SIZE * viewport.height)})
  return guides.sort((a, b) => a.distance - b.distance || (a.axis === b.axis ? a.boundary - b.boundary : a.axis === 'vertical' ? -1 : 1))[0]
}

/** Hit-test a cell's internal split guides in viewport-local pixel coordinates. */
export function findSplitGuideNearPointer(cell, point, viewport = {width: 785, height: 458}, tolerance = 14) {
  const guide = nearestValidSplitGuide(cell, point, viewport)
  return guide && guide.distance <= tolerance ? guide : undefined
}

/** Resolve short-tap intent in divider, split-guide, then containing-cell priority. */
export function resolveShortTap(cells, point, viewport = {width: 785, height: 458}) {
  const divider = findDividerNearPointer(cells, point, viewport)
  if (divider) return {kind: 'merge', divider}
  const logical = {x: point.x / viewport.width * GRID_SIZE, y: point.y / viewport.height * GRID_SIZE}
  const cell = findContainingCell(cells, logical)
  const guide = findSplitGuideNearPointer(cell, point, viewport)
  return guide ? {kind: 'split', cell, guide} : {kind: 'select', cell}
}

/** Split one complete cell at an internal grid boundary. */
export function splitCellAtBoundary(cells, cellId, guide) {
  const parent = cells.find(cell => cell.id === cellId)
  if (!parent || !guide) return {valid: false, reason: 'No valid split guide', cells}
  const vertical = guide.axis === 'vertical'
  const low = vertical ? parent.col : parent.row, high = low + (vertical ? parent.colSpan : parent.rowSpan)
  if (!Number.isInteger(guide.boundary) || guide.boundary <= low || guide.boundary >= high) return {valid: false, reason: 'The guide does not cross this cell', cells}
  const geometries = vertical
    ? [{col: parent.col, row: parent.row, colSpan: guide.boundary - parent.col, rowSpan: parent.rowSpan}, {col: guide.boundary, row: parent.row, colSpan: parent.col + parent.colSpan - guide.boundary, rowSpan: parent.rowSpan}]
    : [{col: parent.col, row: parent.row, colSpan: parent.colSpan, rowSpan: guide.boundary - parent.row}, {col: parent.col, row: guide.boundary, colSpan: parent.colSpan, rowSpan: parent.row + parent.rowSpan - guide.boundary}]
  const pieces = geometries.map((geometry, index) => child(parent, geometry, index === 0 ? 'first' : 'second'))
  if (assignedModule(parent) !== 'empty') [...pieces].sort((a, b) => cellArea(b) - cellArea(a) || a.row - b.row || a.col - b.col)[0].moduleId = parent.moduleId
  const next = sortCells(cells.filter(cell => cell.id !== parent.id).concat(pieces))
  return validateLayout(next) ? {valid: true, cells: next, parentId: parent.id, intendedId: pieces[0].id} : {valid: false, reason: 'The split partition is invalid', cells}
}

export function splitCellNearPointer(cells, point, viewport = {width: 785, height: 458}, tolerance = 14) {
  const logical = {x: point.x / viewport.width * GRID_SIZE, y: point.y / viewport.height * GRID_SIZE}
  const parent = findContainingCell(cells, logical)
  const guide = findSplitGuideNearPointer(parent, point, viewport, tolerance)
  return {...splitCellAtBoundary(cells, parent?.id, guide), guide}
}

/** Find the atomic grid cell containing a viewport-local pointer. */
export function gridCellAtPointer(point, viewport = {width: 785, height: 458}) {
  const index = (value, extent) => Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(value / extent * GRID_SIZE)))
  return {col: index(point.x, viewport.width), row: index(point.y, viewport.height)}
}

/** Return the inclusive, normalized rectangle between two atomic grid cells. */
export function selectionBetweenGridCells(start, end) {
  const col = Math.min(start.col, end.col), row = Math.min(start.row, end.row)
  return {col, row, colSpan: Math.max(start.col, end.col) - col + 1, rowSpan: Math.max(start.row, end.row) - row + 1}
}

/** Select complete cells under both pointers, rather than rounding to nearby edges. */
export function dragSelectionFromPointers(start, end, viewport = {width: 785, height: 458}) {
  return selectionBetweenGridCells(gridCellAtPointer(start, viewport), gridCellAtPointer(end, viewport))
}

/** @deprecated Use dragSelectionFromPointers. Retained for external editor consumers. */
export const snapDragSelection = dragSelectionFromPointers

export function cellsFullyContainedInSelection(cells, selection) {
  return sortCells(cells.filter(cell => cell.col >= selection.col && cell.row >= selection.row && cell.col + cell.colSpan <= selection.col + selection.colSpan && cell.row + cell.rowSpan <= selection.row + selection.rowSpan))
}

export function selectionIsExactlyTiled(cells, selection) {
  if (!selection || selection.colSpan < 1 || selection.rowSpan < 1) return false
  const selected = cellsFullyContainedInSelection(cells, selection)
  if (selected.length < 2 || selected.reduce((sum, cell) => sum + cellArea(cell), 0) !== selection.colSpan * selection.rowSpan) return false
  return Array.from({length: selection.rowSpan}, (_, r) => Array.from({length: selection.colSpan}, (_, c) => selected.filter(cell => c + selection.col >= cell.col && c + selection.col < cell.col + cell.colSpan && r + selection.row >= cell.row && r + selection.row < cell.row + cell.rowSpan).length)).flat().every(count => count === 1)
}

/** Merge every cell exactly tiling a requested rectangle. */
export function mergeCellsInSelection(cells, selection) {
  const selected = cellsFullyContainedInSelection(cells, selection)
  if (!selectionIsExactlyTiled(cells, selection)) return {valid: false, reason: 'Selection must exactly cover whole cells', cells}
  const modules = [...new Set(selected.map(assignedModule).filter(module => module !== 'empty'))]
  if (modules.length > 1) return {valid: false, reason: 'Clear conflicting assignments before merging', cells}
  const ids = selected.map(cell => cell.id).sort()
  const merged = {...selection, id: `merged:${ids.map(encodeURIComponent).join('+')}`, moduleId: modules[0] ?? 'empty'}
  const selectedIds = new Set(ids), next = sortCells(cells.filter(cell => !selectedIds.has(cell.id)).concat(merged))
  return validateLayout(next) ? {valid: true, cells: next, mergedId: merged.id} : {valid: false, reason: 'The merged partition is invalid', cells}
}

const rectangleIntersection = (cell, cut) => {
  const col = Math.max(cell.col, cut.col), row = Math.max(cell.row, cut.row)
  const right = Math.min(cell.col + cell.colSpan, cut.col + cut.colSpan), bottom = Math.min(cell.row + cell.rowSpan, cut.row + cut.rowSpan)
  return right > col && bottom > row ? {col, row, colSpan: right - col, rowSpan: bottom - row} : undefined
}

/** Subtract a rectangular cut from one cell as deterministic rectangular strips. */
export function subtractRectangle(cell, cut) {
  const intersection = rectangleIntersection(cell, cut)
  if (!intersection) return [cell]
  const right = cell.col + cell.colSpan, bottom = cell.row + cell.rowSpan
  const intersectionRight = intersection.col + intersection.colSpan, intersectionBottom = intersection.row + intersection.rowSpan
  const candidates = [
    ['top', {col: cell.col, row: cell.row, colSpan: cell.colSpan, rowSpan: intersection.row - cell.row}],
    ['bottom', {col: cell.col, row: intersectionBottom, colSpan: cell.colSpan, rowSpan: bottom - intersectionBottom}],
    ['left', {col: cell.col, row: intersection.row, colSpan: intersection.col - cell.col, rowSpan: intersection.rowSpan}],
    ['right', {col: intersectionRight, row: intersection.row, colSpan: right - intersectionRight, rowSpan: intersection.rowSpan}],
  ]
  const fragments = candidates.filter(([, geometry]) => geometry.colSpan > 0 && geometry.rowSpan > 0).map(([identity, geometry]) => ({...geometry, id: `${cell.id}/cut-${identity}:${geometry.col},${geometry.row},${geometry.colSpan},${geometry.rowSpan}`, moduleId: 'empty'}))
  if (assignedModule(cell) !== 'empty' && fragments.length) sortCells(fragments).sort((a, b) => cellArea(b) - cellArea(a) || a.row - b.row || a.col - b.col || a.id.localeCompare(b.id))[0].moduleId = cell.moduleId
  return sortCells(fragments)
}

/** Make a dragged rectangle authoritative, rebuilding every intersected remainder. */
export function overwriteWithSelection(cells, selection) {
  if (!validateLayout(cells) || !selection || !Number.isInteger(selection.col) || !Number.isInteger(selection.row) || !Number.isInteger(selection.colSpan) || !Number.isInteger(selection.rowSpan) || selection.col < 0 || selection.row < 0 || selection.colSpan < 1 || selection.rowSpan < 1 || selection.col + selection.colSpan > GRID_SIZE || selection.row + selection.rowSpan > GRID_SIZE) return {valid: false, reason: 'Selection must be a valid grid rectangle', cells}
  if (selectionIsExactlyTiled(cells, selection)) {
    const selected = cellsFullyContainedInSelection(cells, selection)
    const modules = [...new Set(selected.map(assignedModule).filter(module => module !== 'empty'))]
    if (modules.length <= 1) return mergeCellsInSelection(cells, selection)
    const ids = selected.map(cell => cell.id).sort(), selectedIds = new Set(ids)
    const merged = {...selection, id: `merged:${ids.map(encodeURIComponent).join('+')}`, moduleId: 'empty'}
    const next = sortCells(cells.filter(cell => !selectedIds.has(cell.id)).concat(merged))
    return validateLayout(next) ? {valid: true, cells: next, mergedId: merged.id} : {valid: false, reason: 'The merged partition is invalid', cells}
  }
  const intersected = cells.filter(cell => rectangleIntersection(cell, selection))
  const partial = intersected.filter(cell => {
    const intersection = rectangleIntersection(cell, selection)
    return intersection && cellArea(intersection) < cellArea(cell)
  })
  if (!partial.length) return {valid: false, reason: 'Select at least two cells to merge', cells}
  const fragments = cells.flatMap(cell => subtractRectangle(cell, selection))
  const sourceIds = intersected.map(cell => cell.id).sort()
  const override = {...selection, id: `override:${selection.col},${selection.row},${selection.colSpan},${selection.rowSpan}:${sourceIds.map(encodeURIComponent).join('+')}`, moduleId: 'empty'}
  const next = sortCells([...fragments, override])
  return validateLayout(next) ? {valid: true, cells: next, mergedId: override.id} : {valid: false, reason: 'The overwritten partition is invalid', cells}
}

/** Merge a compatible neighboring pair, or return the original partition unchanged. */
export function mergeCells(cells, firstId, secondId) {
  const first = cells.find(cell => cell.id === firstId), second = cells.find(cell => cell.id === secondId)
  if (!first || !second || first === second) return {valid: false, reason: 'Divider does not identify two cells', cells}
  const vertical = first.row === second.row && first.rowSpan === second.rowSpan && (first.col + first.colSpan === second.col || second.col + second.colSpan === first.col)
  const horizontal = first.col === second.col && first.colSpan === second.colSpan && (first.row + first.rowSpan === second.row || second.row + second.rowSpan === first.row)
  if (!vertical && !horizontal) return {valid: false, reason: 'Those cells do not form one rectangle', cells}
  const firstModule = assignedModule(first), secondModule = assignedModule(second)
  if (firstModule !== 'empty' && secondModule !== 'empty' && firstModule !== secondModule) return {valid: false, reason: 'Clear one conflicting assignment before erasing', cells}
  const ids = [first.id, second.id].sort()
  const merged = {
    id: `merged:${ids.map(encodeURIComponent).join('+')}`,
    col: Math.min(first.col, second.col), row: Math.min(first.row, second.row),
    colSpan: vertical ? first.colSpan + second.colSpan : first.colSpan,
    rowSpan: horizontal ? first.rowSpan + second.rowSpan : first.rowSpan,
    moduleId: firstModule !== 'empty' ? firstModule : secondModule,
  }
  const next = sortCells(cells.filter(cell => cell !== first && cell !== second).concat(merged))
  return validateLayout(next) ? {valid: true, cells: next, mergedId: merged.id} : {valid: false, reason: 'The merged partition is invalid', cells}
}

export function mergeDivider(cells, divider) {
  return divider?.cellIds?.length === 2 ? mergeCells(cells, divider.cellIds[0], divider.cellIds[1]) : {valid: false, reason: 'No removable divider selected', cells}
}

export function findContainingCell(cells, point) {
  return sortCells(cells).find(c => point.x >= c.col && point.x <= c.col + c.colSpan && point.y >= c.row && point.y <= c.row + c.rowSpan)
}

export function chooseNearestEdge(cell, orientation, boundary) {
  if (orientation === 'vertical') return boundary - cell.col <= cell.col + cell.colSpan - boundary ? 'left' : 'right'
  return boundary - cell.row <= cell.row + cell.rowSpan - boundary ? 'top' : 'bottom'
}

/** Choose the neighboring band's outer edge; exact middle ties go upward. */
export const nearestVerticalCompletionEdge = (region, boundary) => boundary - region.row <= region.row + region.rowSpan - boundary ? region.row : region.row + region.rowSpan

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

/**
 * Normalize and apply a mode-less divider stroke. Dotted units are added while
 * a stroke that is predominantly over solid units removes the whole traced
 * segment. Atomic connectivity is converted back to rectangular editor cells,
 * so an operation which would make an L-shaped region is rejected unchanged.
 */
export function previewDividerStroke(cells, stroke, viewport = {width: 785, height: 458}) {
  const length = Math.hypot(stroke.end.x - stroke.start.x, stroke.end.y - stroke.start.y)
  if (length < MIN_STROKE_PX) return {valid: false, reason: 'Draw a longer line', cells}
  if (!validateLayout(cells) || [stroke.start, stroke.end].some(p => p.x < 0 || p.y < 0 || p.x > viewport.width || p.y > viewport.height)) return {valid: false, reason: 'Keep the line inside the viewport', cells}
  const lock = stroke.lock ?? resolveDividerStrokeLock(stroke, viewport)
  if (!lock) return {valid: false, reason: 'That line does not follow an internal grid path', cells}
  const orientation = lock.orientation
  const vertical = orientation === 'vertical'
  const boundary = lock.boundary
  const alongExtent = vertical ? viewport.height : viewport.width
  const rangeStart = touchedRangeBoundary(Math.min(vertical ? stroke.start.y : stroke.start.x, vertical ? stroke.end.y : stroke.end.x), alongExtent, 'floor')
  const rangeEnd = touchedRangeBoundary(Math.max(vertical ? stroke.start.y : stroke.start.x, vertical ? stroke.end.y : stroke.end.x), alongExtent, 'ceil')
  const normalized = {orientation, boundary, rangeStart, rangeEnd}
  if (boundary <= 0 || boundary >= GRID_SIZE || rangeStart >= rangeEnd) return {valid: false, reason: 'That line does not follow an internal grid path', cells, normalized}

  const key = (axis, fixed, along) => `${axis}:${fixed}:${along}`
  const barriers = new Set()
  for (const segment of internalDividerSegments(cells)) for (let along = segment.from; along < segment.to; along++) barriers.add(key(segment.axis, segment.boundary, along))
  let existing = 0
  for (let along = rangeStart; along < rangeEnd; along++) if (barriers.has(key(orientation, boundary, along))) existing++
  const intent = existing > (rangeEnd - rangeStart) / 2 ? 'erase' : 'draw'
  const directKeys = new Set(Array.from({length: rangeEnd - rangeStart}, (_, index) => key(orientation, boundary, rangeStart + index)))
  const inferredKeys = new Set()

  // A direct stroke which passes through a perpendicular structural segment is
  // authoritative. Remove that whole contiguous segment; merely ending on it
  // leaves the segment in place as a useful T-junction.
  if (intent === 'draw') for (const segment of internalDividerSegments(cells)) {
    if (segment.axis === orientation) continue
    const crossed = rangeStart < segment.boundary && rangeEnd > segment.boundary && boundary >= segment.from && boundary < segment.to
    if (crossed) for (let along = segment.from; along < segment.to; along++) barriers.delete(key(segment.axis, segment.boundary, along))
  }

  // Find the rectangular region being edited after direct overwrite, but
  // before adding the new divider. This makes completion recursive: a line in
  // a nested cell completes only across that cell, not across the frame.
  const componentAt = (originCol, originRow) => {
    const seen = new Set([`${originCol},${originRow}`]), queue = [{col: originCol, row: originRow}], points = []
    while (queue.length) {
      const point = queue.shift(); points.push(point)
      const neighbors = [
        {col: point.col - 1, row: point.row, blocked: key('vertical', point.col, point.row)},
        {col: point.col + 1, row: point.row, blocked: key('vertical', point.col + 1, point.row)},
        {col: point.col, row: point.row - 1, blocked: key('horizontal', point.row, point.col)},
        {col: point.col, row: point.row + 1, blocked: key('horizontal', point.row + 1, point.col)},
      ]
      for (const next of neighbors) if (next.col >= 0 && next.row >= 0 && next.col < GRID_SIZE && next.row < GRID_SIZE && !barriers.has(next.blocked) && !seen.has(`${next.col},${next.row}`)) { seen.add(`${next.col},${next.row}`); queue.push(next) }
    }
    const col = Math.min(...points.map(p => p.col)), row = Math.min(...points.map(p => p.row))
    return {col, row, colSpan: Math.max(...points.map(p => p.col)) - col + 1, rowSpan: Math.max(...points.map(p => p.row)) - row + 1}
  }
  const sampleAlong = Math.min(GRID_SIZE - 1, rangeStart)
  const region = vertical ? componentAt(Math.max(0, boundary - 1), sampleAlong) : componentAt(sampleAlong, Math.max(0, boundary - 1))

  for (let along = rangeStart; along < rangeEnd; along++) {
    const unit = key(orientation, boundary, along)
    if (intent === 'erase') barriers.delete(unit)
    else barriers.add(unit)
  }

  if (intent === 'draw') {
    const addInferred = (axis, fixed, from, to) => {
      for (let along = from; along < to; along++) {
        const unit = key(axis, fixed, along)
        barriers.add(unit)
        if (!directKeys.has(unit)) inferredKeys.add(unit)
      }
    }
    if (vertical) {
      const top = region.row, bottom = region.row + region.rowSpan
      if (rangeStart > top && rangeStart < bottom) addInferred('horizontal', rangeStart, region.col, region.col + region.colSpan)
      if (rangeEnd > top && rangeEnd < bottom) addInferred('horizontal', rangeEnd, region.col, region.col + region.colSpan)
    } else {
      // Horizontal gestures establish a band boundary across the affected
      // rectangle. Each original internal endpoint subdivides the nearest band.
      addInferred('horizontal', boundary, region.col, region.col + region.colSpan)
      const nearestVerticalSide = nearestVerticalCompletionEdge(region, boundary)
      for (const endpoint of [rangeStart, rangeEnd]) if (endpoint > region.col && endpoint < region.col + region.colSpan) {
        addInferred('vertical', endpoint, Math.min(boundary, nearestVerticalSide), Math.max(boundary, nearestVerticalSide))
      }
    }
  }

  const visited = new Set(), geometries = []
  for (let row = 0; row < GRID_SIZE; row++) for (let col = 0; col < GRID_SIZE; col++) {
    const origin = `${col},${row}`
    if (visited.has(origin)) continue
    const queue = [{col, row}], component = []
    visited.add(origin)
    while (queue.length) {
      const point = queue.shift(); component.push(point)
      const neighbors = [
        {col: point.col - 1, row: point.row, blocked: key('vertical', point.col, point.row)},
        {col: point.col + 1, row: point.row, blocked: key('vertical', point.col + 1, point.row)},
        {col: point.col, row: point.row - 1, blocked: key('horizontal', point.row, point.col)},
        {col: point.col, row: point.row + 1, blocked: key('horizontal', point.row + 1, point.col)},
      ]
      for (const next of neighbors) if (next.col >= 0 && next.row >= 0 && next.col < GRID_SIZE && next.row < GRID_SIZE && !barriers.has(next.blocked) && !visited.has(`${next.col},${next.row}`)) { visited.add(`${next.col},${next.row}`); queue.push(next) }
    }
    const minCol = Math.min(...component.map(p => p.col)), maxCol = Math.max(...component.map(p => p.col)), minRow = Math.min(...component.map(p => p.row)), maxRow = Math.max(...component.map(p => p.row))
    const geometry = {col: minCol, row: minRow, colSpan: maxCol - minCol + 1, rowSpan: maxRow - minRow + 1}
    if (cellArea(geometry) !== component.length) return {valid: false, reason: 'That stroke would create a non-rectangular region', cells, normalized, intent, directKeys: [...directKeys], inferredKeys: [...inferredKeys]}
    geometries.push(geometry)
  }
  const next = sortCells(geometries.map(geometry => {
    const unchanged = cells.find(cell => cell.col === geometry.col && cell.row === geometry.row && cell.colSpan === geometry.colSpan && cell.rowSpan === geometry.rowSpan)
    return unchanged ?? {...geometry, id: `stroke:${geometry.col},${geometry.row},${geometry.colSpan},${geometry.rowSpan}`, moduleId: 'empty'}
  }))
  if (!validateLayout(next) || internalDividerSegments(next).some(segment => {
    for (let along = segment.from; along < segment.to; along++) if (!barriers.has(key(segment.axis, segment.boundary, along))) return true
    return false
  })) return {valid: false, reason: 'The proposed partition is invalid', cells, normalized, intent}
  return {valid: true, cells: next, normalized, intent, directKeys: [...directKeys], inferredKeys: [...inferredKeys]}
}

/** Synchronous mode-less divider entrypoint; pass the actual release point. */
export const finalizeDividerStroke = (cells, start, end, viewport, lock) => previewDividerStroke(cells, {start, end, lock}, viewport)

/** Synchronous pointer-up entrypoint; callers must pass the actual release point. */
export const finalizeStroke = (cells, start, end, viewport) => previewStroke(cells, {start, end}, viewport)

export const commitPreview = (cells, preview) => preview.valid ? preview.cells : cells
export const initialLayout = () => [{id: 'cell', col: 0, row: 0, colSpan: 4, rowSpan: 4, moduleId: 'empty'}]

export function createHistory(initial = initialLayout()) { return {past: [], present: initial, future: []} }
export function pushHistory(history, next) { return next === history.present ? history : {past: [...history.past, history.present], present: next, future: []} }
export function undoHistory(history) { return history.past.length ? {past: history.past.slice(0, -1), present: history.past.at(-1), future: [history.present, ...history.future]} : history }
export function redoHistory(history) { return history.future.length ? {past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1)} : history }
