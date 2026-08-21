export const BUILT_IN_LAYOUT_KEYS = Object.freeze(['default', 'pyramid', 'square', 'full'])
export const CUSTOM_LAYOUT_NAME_MAX = 40
export const SUPPORTED_PHYSICAL_GEOMETRIES = new Set(['4x1', '2x2', '4x2', '4x4'])

export function normalizeLayoutName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, CUSTOM_LAYOUT_NAME_MAX)
}

export function orderedLayoutItems(customLayouts) {
  return [
    ...BUILT_IN_LAYOUT_KEYS.map(key => ({ type: 'built-in', key, id: `built-in:${key}` })),
    ...[...customLayouts].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(layout => ({ type: 'custom', key: layout.id, id: layout.id, layout })),
    { type: 'add', key: 'add-layout', id: 'add-layout' },
  ]
}

export function validateCustomGeometry(cells, { requirePhysical = true, requireModules = false } = {}) {
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
    if (requirePhysical && !SUPPORTED_PHYSICAL_GEOMETRIES.has(`${colSpan}x${rowSpan}`)) unsupportedSlots.push(slot)
    if (requireModules && (typeof cell.module !== 'string' || !cell.module.trim())) errors.push('missing_module')
    for (let y = row; y < row + rowSpan; y++) for (let x = col; x < col + colSpan; x++) {
      const index = y * 4 + x
      if (occupied[index]) errors.push('overlap')
      occupied[index] = true
    }
  }
  if (!occupied.every(Boolean)) errors.push('holes')
  if (unsupportedSlots.length) errors.push('unsupported_geometry')
  return { valid: errors.length === 0, errors: [...new Set(errors)], unsupportedSlots }
}

export function geometryWithAssignments(cells, assignments) {
  return cells.map(cell => ({ ...cell, module: assignments[cell.slot] ?? '' }))
}

export function customPhysicalPayload(layout, assignments) {
  const cells = geometryWithAssignments(layout.cells, assignments)
  const validation = validateCustomGeometry(cells, { requirePhysical: true, requireModules: true })
  return validation.valid ? { layout: 'custom', custom_layout_id: layout.id, cells } : null
}

const geometryKey = cell => `${cell.col},${cell.row},${cell.colSpan},${cell.rowSpan}`

/** Preserve assignments only for geometrically identical cells after an edit. */
export function remapAssignmentsAfterGeometryEdit(previousCells, nextCells, assignments) {
  const moduleByGeometry = new Map(previousCells.map(cell => [geometryKey(cell), assignments[cell.slot] ?? null]))
  return Object.fromEntries(nextCells.map(cell => [cell.slot, moduleByGeometry.get(geometryKey(cell)) ?? null]))
}

export function duplicateLayout(layout, id, now = new Date().toISOString()) {
  return { ...layout, id, name: `${layout.name} copy`.slice(0, CUSTOM_LAYOUT_NAME_MAX), sortOrder: layout.sortOrder + 1, createdAt: now, updatedAt: now }
}
