export const BUILT_IN_LAYOUT_KEYS = Object.freeze(['default', 'pyramid', 'square', 'full'])
export const CUSTOM_LAYOUT_NAME_MAX = 40
export const SUPPORTED_PHYSICAL_GEOMETRIES = new Set(['4x1', '2x2', '4x2', '4x4'])
export const ADAPTIVE_DATE_GEOMETRIES = new Set(['1x1','1x2','1x3','1x4','2x1','2x3','2x4','3x1','3x2','3x3','3x4','4x3'])

export function normalizeLayoutName(value) {
  return Array.from(String(value ?? '').trim().replace(/\s+/gu, ' ').toLocaleUpperCase()).slice(0, CUSTOM_LAYOUT_NAME_MAX).join('')
}

export function nextCustomLayoutName(layouts) {
  const highest = layouts.reduce((maximum, layout) => {
    const match = normalizeLayoutName(layout?.name).match(/^CUSTOM\s+(\d+)$/iu)
    return match ? Math.max(maximum, Number(match[1])) : maximum
  }, 0)
  return `CUSTOM ${highest + 1}`
}

export function orderedLayoutItems(customLayouts) {
  return [
    ...BUILT_IN_LAYOUT_KEYS.map(key => ({ type: 'built-in', key, id: `built-in:${key}` })),
    ...[...customLayouts].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(layout => ({ type: 'custom', key: layout.id, id: layout.id, layout })),
    { type: 'add', key: 'add-layout', id: 'add-layout' },
  ]
}

export function validateCustomGeometry(cells, { requireModules = false } = {}) {
  const errors = []
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > 16) return { valid: false, errors: ['cell_count'], unsupportedSlots: [] }
  const occupied = Array(16).fill(false), slots = new Set(), unsupportedSlots = []
  for (const cell of cells) {
    if (!cell || typeof cell !== 'object') { errors.push('malformed_cell'); continue }
    const { slot, col, row, colSpan, rowSpan } = cell
    if (![slot, col, row, colSpan, rowSpan].every(Number.isInteger)) { errors.push('non_integer'); continue }
    if (slot < 0 || slot > 15 || slots.has(slot)) errors.push(slots.has(slot) ? 'duplicate_slot' : 'invalid_slot')
    slots.add(slot)
    if (col < 0 || row < 0 || colSpan < 1 || rowSpan < 1 || col + colSpan > 4 || row + rowSpan > 4) { errors.push('out_of_bounds'); continue }
    if (requireModules && (typeof cell.module !== 'string' || !cell.module.trim())) errors.push('missing_module')
    for (let y = row; y < row + rowSpan; y++) for (let x = col; x < col + colSpan; x++) {
      const index = y * 4 + x
      if (occupied[index]) errors.push('overlap')
      occupied[index] = true
    }
  }
  if (!occupied.every(Boolean)) errors.push('holes')
  return { valid: errors.length === 0, errors: [...new Set(errors)], unsupportedSlots }
}

export function supportsPhysicalCustomCell(cell) {
  if (!cell || typeof cell !== 'object') return false
  const geometry = `${cell.colSpan}x${cell.rowSpan}`
  const module = typeof cell.module === 'string' ? cell.module.trim().toLowerCase() : ''
  // An unassigned cell still has valid physical geometry. Capability checks
  // only become relevant after the user assigns a module to it.
  if (!module) return true
  const baseModule = module.split(':', 1)[0]
  const surfModule = /^surf(?::(?:[1-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))?$/u.test(module)
  const soccerModule = /^soccer(?::[1-4])?$/u.test(module)
  const stocksModule = /^stocks(?::(?:[1-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))?$/u.test(module)
  const groceriesModule = module === 'groceries'
  if (module.startsWith('surf') && !surfModule) return false
  if (module.startsWith('soccer') && !soccerModule) return false
  if (module.startsWith('stocks') && !stocksModule) return false
  if (module.startsWith('groceries') && !groceriesModule) return false
  const adaptiveModule = module === 'date' || groceriesModule || baseModule === 'weather' || baseModule === 'reminders' || baseModule === 'countdown' || surfModule || soccerModule || stocksModule
  return SUPPORTED_PHYSICAL_GEOMETRIES.has(geometry) || (ADAPTIVE_DATE_GEOMETRIES.has(geometry) && adaptiveModule)
}

export function supportsPhysicalCustomLayout(cells) {
  const structural = validateCustomGeometry(cells)
  if (!structural.valid) return {...structural, unsupportedSlots: structural.unsupportedSlots}
  const unsupportedSlots = cells.filter(cell => !supportsPhysicalCustomCell(cell)).map(cell => cell.slot)
  return {valid: unsupportedSlots.length === 0, errors: unsupportedSlots.length ? ['unsupported_physical_cell'] : [], unsupportedSlots}
}

export function geometryWithAssignments(cells, assignments) {
  return cells.map(cell => ({ ...cell, module: assignments[cell.slot] ?? '' }))
}

export function customPhysicalPayload(layout, assignments) {
  const cells = geometryWithAssignments(layout.cells, assignments)
  const validation = supportsPhysicalCustomLayout(cells)
  return validation.valid ? { layout: 'custom', custom_layout_id: layout.id, cells } : null
}

const geometryKey = cell => `${cell.col},${cell.row},${cell.colSpan},${cell.rowSpan}`

/** Preserve assignments only for geometrically identical cells after an edit. */
export function remapAssignmentsAfterGeometryEdit(previousCells, nextCells, assignments) {
  const moduleByGeometry = new Map(previousCells.map(cell => [geometryKey(cell), assignments[cell.slot] ?? null]))
  return Object.fromEntries(nextCells.map(cell => [cell.slot, moduleByGeometry.get(geometryKey(cell)) ?? null]))
}

export function duplicateLayout(layout, id, now = new Date().toISOString()) {
  return { ...layout, id, name: normalizeLayoutName(`${layout.name} copy`), sortOrder: layout.sortOrder + 1, createdAt: now, updatedAt: now }
}

/** Build one consistent client snapshot after the server creates a duplicate. */
export function duplicateLayoutClientState(layouts, assignments, sourceId, duplicate) {
  const sourceIndex = layouts.findIndex(layout => layout.id === sourceId)
  const insertionIndex = sourceIndex < 0 ? layouts.length : sourceIndex + 1
  return {
    layouts: [...layouts.slice(0, insertionIndex), duplicate, ...layouts.slice(insertionIndex)],
    assignments: { ...assignments, [duplicate.id]: { ...(assignments[sourceId] || {}) } },
    carouselItemId: duplicate.id,
    activeCustomLayoutId: duplicate.id,
  }
}
