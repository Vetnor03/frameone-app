// Minimal, account-scoped launch preview. Never store modulesJson or API data:
// device settings can contain integration credentials and private content.
export const LAUNCH_PREVIEW_PREFIX = 'remind:launch-preview:v1:'
export const LAUNCH_PREVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_BYTES = 12000
const layouts = new Set(['default', 'pyramid', 'square', 'full', 'custom'])
const modules = new Set(['assistant', 'date', 'weather', 'surf', 'ski', 'reminders', 'news', 'countdown', 'soccer', 'stocks', 'groceries'])
const safeId = value => typeof value === 'string' && value.length >= 8 && value.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(value)
const safeInteger = (value, min, max) => Number.isInteger(value) && value >= min && value <= max

function sanitizeCells(value) {
  if (!Array.isArray(value) || value.length > 64) return []
  return value.flatMap(cell => {
    if (!cell || typeof cell !== 'object' || !safeInteger(cell.slot, 0, 128)) return []
    const rawModule = cell.module === null || cell.module === '' ? null : cell.module
    // Settings encode repeated modules as weather:1, surf:2, etc.
    const module = typeof rawModule === 'string' ? rawModule.split(':')[0] : rawModule
    if (module !== null && !modules.has(module)) return []
    const entry = { slot: cell.slot, module }
    if (safeInteger(cell.col, 0, 8) && safeInteger(cell.row, 0, 8)
      && safeInteger(cell.colSpan, 1, 8) && safeInteger(cell.rowSpan, 1, 8)) {
      return [{ ...entry, col: cell.col, row: cell.row, colSpan: cell.colSpan, rowSpan: cell.rowSpan }]
    }
    return [entry]
  })
}

function sanitizeCustomLayout(layout, deviceId, userId) {
  if (!layout || typeof layout !== 'object' || !safeId(layout.id)
    || !Array.isArray(layout.cells) || layout.cells.length > 64) return null
  const cells = layout.cells.flatMap(cell => (
    cell && safeInteger(cell.slot, 0, 128)
      && safeInteger(cell.col, 0, 8) && safeInteger(cell.row, 0, 8)
      && safeInteger(cell.colSpan, 1, 8) && safeInteger(cell.rowSpan, 1, 8)
      ? [{ slot: cell.slot, col: cell.col, row: cell.row, colSpan: cell.colSpan, rowSpan: cell.rowSpan }]
      : []
  ))
  if (cells.length !== layout.cells.length) return null
  return {
    id: layout.id,
    deviceId,
    ownerUserId: userId,
    name: typeof layout.name === 'string' ? layout.name.slice(0, 40) : 'Custom',
    cells,
    sortOrder: safeInteger(layout.sortOrder, 0, 10000) ? layout.sortOrder : 0,
    createdAt: '',
    updatedAt: '',
  }
}

function sanitizePreview(value, deviceId, userId) {
  if (!value || typeof value !== 'object') return null
  const layout = layouts.has(value.layout) ? value.layout : 'default'
  const customLayout = layout === 'custom'
    ? sanitizeCustomLayout(value.customLayout, deviceId, userId)
    : null
  // Never render a custom selection without matching, validated geometry.
  const resolvedLayout = layout === 'custom' && !customLayout ? 'default' : layout
  const customId = customLayout?.id ?? null
  return {
    theme: value.theme === 'light' ? 'light' : 'dark',
    powerSaver: value.powerSaver === true,
    language: value.language === 'no' ? 'no' : 'en',
    fontSize: value.fontSize === 'large' ? 'large' : 'normal',
    layout: resolvedLayout,
    custom_layout_id: resolvedLayout === 'custom' ? customId : null,
    cells: sanitizeCells(value.cells),
    pinned_tabs: Array.isArray(value.pinned_tabs)
      ? value.pinned_tabs.filter(module => modules.has(module) && module !== 'date').slice(0, 16)
      : [],
    customLayout,
  }
}

export function launchPreviewKey(userId) {
  return safeId(userId) ? LAUNCH_PREVIEW_PREFIX + userId : null
}

export function readLaunchPreview(storage, userId, now = Date.now()) {
  const key = launchPreviewKey(userId)
  if (!key || !storage) return null
  try {
    const raw = storage.getItem(key)
    if (!raw || raw.length > MAX_BYTES) return null
    const cached = JSON.parse(raw)
    if (cached?.version !== 1 || cached?.userId !== userId
      || !safeId(cached.deviceId) || !Number.isFinite(cached.savedAt)
      || cached.savedAt > now + 60000 || now - cached.savedAt > LAUNCH_PREVIEW_TTL_MS
      || now < cached.savedAt - 60000) return null
    const preview = sanitizePreview(cached.preview, cached.deviceId, userId)
    return preview ? { deviceId: cached.deviceId, preview } : null
  } catch {
    return null
  }
}

export function writeLaunchPreview(storage, userId, deviceId, settings, customLayout = null, now = Date.now()) {
  const key = launchPreviewKey(userId)
  if (!key || !safeId(deviceId) || !storage) return false
  try {
    const preview = sanitizePreview({ ...settings, customLayout }, deviceId, userId)
    if (!preview) return false
    const raw = JSON.stringify({ version: 1, userId, deviceId, savedAt: now, preview })
    if (raw.length > MAX_BYTES) return false
    storage.setItem(key, raw)
    return true
  } catch {
    // Privacy settings, storage quotas and private browsing can deny access.
    return false
  }
}

export function clearLaunchPreview(storage, userId) {
  const key = launchPreviewKey(userId)
  if (!key || !storage) return
  try { storage.removeItem(key) } catch { /* storage unavailable */ }
}
