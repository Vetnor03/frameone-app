// Display-only cache for Connect. Never store auth tokens or integration settings.
// Scope snapshots to the authenticated account AND selected frame.
export const CONNECT_STATUS_CACHE_PREFIX = 'remind:connect-status:v2:'
export const CONNECT_STATUS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value)
const PROVIDERS = new Set(['teams', 'google-calendar', 'spond', 'local-events', 'waste', 'bonnetid', 'todoist', 'microsoft-todo', 'google-tasks', 'calendar-link', 'familywall'])

export function connectStatusCacheKey(userId, deviceId) {
  return validId(userId) && validId(deviceId) ? CONNECT_STATUS_CACHE_PREFIX + userId + ':' + deviceId : null
}

export function readConnectStatusCache(storage, userId, deviceId, now = Date.now()) {
  const key = connectStatusCacheKey(userId, deviceId)
  if (!key || !storage) return {}
  try {
    const raw = storage.getItem(key)
    if (!raw || raw.length > 2000) return {}
    const snapshot = JSON.parse(raw)
    if (snapshot?.version !== 1 || snapshot.userId !== userId || snapshot.deviceId !== deviceId
      || !Number.isFinite(snapshot.savedAt) || snapshot.savedAt > now + 60000
      || now - snapshot.savedAt > CONNECT_STATUS_CACHE_MAX_AGE_MS
      || !snapshot.connections || typeof snapshot.connections !== 'object'
      || Array.isArray(snapshot.connections)) return {}
    return Object.fromEntries(Object.entries(snapshot.connections)
      .filter(([provider, connected]) => PROVIDERS.has(provider) && typeof connected === 'boolean'))
  } catch { return {} }
}

export function writeConnectStatusCache(storage, userId, deviceId, provider, connected, now = Date.now()) {
  const key = connectStatusCacheKey(userId, deviceId)
  if (!key || !storage || !PROVIDERS.has(provider) || typeof connected !== 'boolean') return false
  try {
    const connections = { ...readConnectStatusCache(storage, userId, deviceId, now), [provider]: connected }
    storage.setItem(key, JSON.stringify({ version: 1, userId, deviceId, savedAt: now, connections }))
    return true
  } catch { return false }
}

export function clearConnectStatusCacheForUser(storage, userId) {
  if (!validId(userId) || !storage) return
  try {
    const prefixes = [CONNECT_STATUS_CACHE_PREFIX, 'remind:connect-status:v1:']
      .map(prefix => prefix + userId + ':')
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i)
      if (key && prefixes.some(prefix => key.startsWith(prefix))) storage.removeItem(key)
    }
  } catch { /* browser storage may be unavailable */ }
}

/**
 * Connect is an account-level authorization list, not a per-frame module picker.
 * Onboarding is the exception: it must never opt a new frame into integrations
 * the owner has not selected. A server response always supersedes display cache.
 */
export function resolveConnectBadge({
  connectable = true, startup = false, frameEnabled = false,
  locallyDisconnected = false, verified, accountConnected = false, cached,
}) {
  if (!connectable || locallyDisconnected || (startup && !frameEnabled)) return false
  if (typeof verified === 'boolean') return verified
  if (accountConnected) return true
  if (typeof cached === 'boolean') return cached
  return false
}
