// Prewarm only configured module tabs, never utility/auth-sensitive surfaces.
// The caller mounts each module into a hidden, read-only in-memory panel.
const MODULES = new Set([
  'date', 'weather', 'surf', 'ski', 'reminders', 'news',
  'countdown', 'soccer', 'stocks', 'groceries',
])

// A warmup can start only after the frame membership and settings are loaded.
// The assistant is intentionally excluded: it has its own on-demand lifecycle.
export function planModuleTabWarmup(tabKeys, alreadyMounted = [], activeKey = '') {
  const mounted = new Set(alreadyMounted)
  return Array.from(new Set(tabKeys)).filter(key =>
    MODULES.has(key) && key !== activeKey && !mounted.has(key)
  )
}

export function tabCacheScope(userId, deviceId) {
  if (!userId || !deviceId) return ''
  return JSON.stringify([userId, deviceId])
}

export function appendCachedModuleTab(cache, scope, tabKey) {
  if (!scope || !MODULES.has(tabKey)) return cache
  const keys = cache.scope === scope ? cache.keys : []
  if (keys.includes(tabKey)) return cache
  return { scope, keys: [...keys, tabKey] }
}
