// The pilot Custom onboarding offers the existing built-in frame geometries.
// Freeform custom geometry remains separately feature-gated.
export const CUSTOM_SETUP_LAYOUT_SLOTS = Object.freeze({
  default: 3,
  pyramid: 4,
  square: 4,
  full: 1,
})

export const CUSTOM_SETUP_MODULES = Object.freeze([
  'date', 'reminders', 'news', 'weather', 'countdown',
  'groceries', 'stocks', 'soccer', 'surf', 'ski',
])

export function starterCustomCells(layout) {
  const count = CUSTOM_SETUP_LAYOUT_SLOTS[layout]
  if (!count) return null
  const initial = ['date', 'reminders', 'news']
  return Object.fromEntries(Array.from({ length: count }, (_, i) => [i, initial[i] ?? null]))
}

export function validateCustomSetup(layout, cells, weatherLocationChosen) {
  const count = CUSTOM_SETUP_LAYOUT_SLOTS[layout]
  if (!count || !cells || typeof cells !== 'object' || Array.isArray(cells)) {
    return { valid: false, reason: 'invalid_layout' }
  }
  const allowed = new Set(CUSTOM_SETUP_MODULES)
  const selected = new Set()
  const safeCells = {}
  for (let slot = 0; slot < count; slot++) {
    const value = cells[slot] ?? null
    if (value !== null && !allowed.has(value)) return { valid: false, reason: 'invalid_module' }
    if (value !== null && selected.has(value)) return { valid: false, reason: 'duplicate_module' }
    if (value !== null) selected.add(value)
    safeCells[slot] = value
  }
  if (selected.size === 0) return { valid: false, reason: 'no_modules' }
  if (selected.has('weather') && !weatherLocationChosen) return { valid: false, reason: 'weather_location' }
  return { valid: true, cells: safeCells, weatherSelected: selected.has('weather'), newsSelected: selected.has('news') }
}
