import { BUILT_IN_LAYOUT_KEYS } from './customLayouts.ts'

export type BuiltInLayoutKey = typeof BUILT_IN_LAYOUT_KEYS[number]
export type FrameModuleKey = 'assistant' | 'date' | 'weather' | 'surf' | 'reminders' | 'countdown' | 'soccer' | 'stocks' | 'groceries'

const SLOT_COUNT: Record<BuiltInLayoutKey, number> = { default: 3, pyramid: 4, square: 4, full: 1 }
const MODULES = new Set<FrameModuleKey>(['assistant', 'date', 'weather', 'surf', 'reminders', 'countdown', 'soccer', 'stocks', 'groceries'])

export function isBuiltInLayoutKey(value: unknown): value is BuiltInLayoutKey {
  return typeof value === 'string' && BUILT_IN_LAYOUT_KEYS.includes(value as BuiltInLayoutKey)
}

export function normalizeBuiltInLayout(value: unknown): BuiltInLayoutKey | null {
  const clean = typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
  const numbered: Record<string, BuiltInLayoutKey> = { '1': 'default', 'layout 1': 'default', 'oppsett 1': 'default', '2': 'pyramid', 'layout 2': 'pyramid', 'oppsett 2': 'pyramid', '3': 'square', 'layout 3': 'square', 'oppsett 3': 'square', '4': 'full', 'layout 4': 'full', 'oppsett 4': 'full' }
  return isBuiltInLayoutKey(clean) ? clean : numbered[clean] ?? null
}

function moduleFromStored(value: unknown): FrameModuleKey | null {
  if (typeof value !== 'string') return null
  const base = value.trim().split(':')[0].toLocaleLowerCase() as FrameModuleKey
  return MODULES.has(base) ? base : null
}

export function emptyBuiltInLayoutCells(layout: BuiltInLayoutKey): Record<number, FrameModuleKey | null> {
  return Object.fromEntries(Array.from({ length: SLOT_COUNT[layout] }, (_, slot) => [slot, null]))
}

export function sanitizeLayoutModuleMemory(value: unknown): Array<FrameModuleKey | null> {
  return Array.isArray(value) ? value.map(moduleFromStored) : []
}

export function projectSlotMemoryIntoBuiltInLayout(memory: Array<FrameModuleKey | null>, layout: BuiltInLayoutKey) {
  const cells = emptyBuiltInLayoutCells(layout)
  for (const slot of Object.keys(cells).map(Number)) cells[slot] = memory[slot] ?? null
  return cells
}

export function serializeBuiltInLayoutCells(cells: Record<number, FrameModuleKey | null>) {
  const counters: Partial<Record<FrameModuleKey, number>> = {}
  return Object.entries(cells).filter(([, module]) => module).map(([slot, module]) => {
    if (!module || !['weather', 'surf', 'soccer', 'stocks', 'groceries'].includes(module)) return { slot: Number(slot), module: module ?? '' }
    counters[module] = (counters[module] ?? 0) + 1
    return { slot: Number(slot), module: `${module}:${counters[module]}` }
  })
}

/** Canonical persisted transition used by FRAME and Assistant. */
export function transitionBuiltInLayoutSettings(settings: Record<string, unknown>, target: BuiltInLayoutKey) {
  const source = isBuiltInLayoutKey(settings.layout) ? settings.layout : 'default'
  const memory = sanitizeLayoutModuleMemory(settings.layout_module_memory)
  const sourceSlots = SLOT_COUNT[source]
  if (Array.isArray(settings.cells)) for (const row of settings.cells) {
    if (!row || typeof row !== 'object') continue
    const slot = Number((row as Record<string, unknown>).slot)
    if (Number.isInteger(slot) && slot >= 0 && slot < sourceSlots) memory[slot] = moduleFromStored((row as Record<string, unknown>).module)
  }
  const cells = projectSlotMemoryIntoBuiltInLayout(memory, target)
  const { custom_layout_id: _customLayoutId, ...preserved } = settings
  return { ...preserved, layout: target, cells: serializeBuiltInLayoutCells(cells), layout_module_memory: memory }
}
