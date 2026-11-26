/**
 * Orders module tabs for the assignments belonging to the layout on screen.
 * The caller is responsible for selecting the authoritative assignment map.
 */
export function deriveDynamicModuleKeys(activeLayoutModules, pinnedModuleTabs) {
  const activeModules = Array.from(
    new Set(Object.values(activeLayoutModules ?? {}).filter((module) => module && module !== 'date')),
  )

  const uniquePins = [...new Set(pinnedModuleTabs)]
  const pinnedInactive = uniquePins.filter(
    (module) => module !== 'date' && !activeModules.includes(module),
  )
  const pinnedActive = uniquePins.filter(
    (module) => module !== 'date' && activeModules.includes(module),
  )
  const activeUnpinned = activeModules.filter((module) => !pinnedActive.includes(module))

  return [...pinnedActive, ...activeUnpinned, ...pinnedInactive]
}

const pinnableModules = new Set(['assistant', 'weather', 'surf', 'ski', 'reminders', 'news', 'countdown', 'soccer', 'stocks', 'groceries'])

function normalizePins(value) {
  return Array.isArray(value) ? [...new Set(value.filter(key => pinnableModules.has(key)))] : []
}

function pinnedTabsKey(userId, deviceId) {
  return userId && deviceId
    ? `remind:module-tab-pins:v1:${encodeURIComponent(userId)}:${encodeURIComponent(deviceId)}`
    : null
}

// Unlike a launch preview, this is an explicit app preference, including [].
export function readPinnedModuleTabs(storage, userId, deviceId) {
  const key = pinnedTabsKey(userId, deviceId)
  if (!key || !storage) return null
  try {
    const raw = storage.getItem(key)
    if (raw === null) return null
    const value = JSON.parse(raw)
    return Array.isArray(value) ? normalizePins(value) : null
  } catch {
    return null
  }
}

export function writePinnedModuleTabs(storage, userId, deviceId, pins) {
  const key = pinnedTabsKey(userId, deviceId)
  if (!key || !storage) return false
  try {
    storage.setItem(key, JSON.stringify(normalizePins(pins)))
    return true
  } catch {
    return false
  }
}

export function togglePinnedModuleTab(pins, moduleKey) {
  const current = [...new Set(pins)]
  if (!pinnableModules.has(moduleKey)) return current
  return current.includes(moduleKey)
    ? current.filter(key => key !== moduleKey)
    : [...current, moduleKey]
}
