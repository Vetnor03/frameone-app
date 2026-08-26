/**
 * First-party product analytics for product improvement. Generic events must
 * never contain user-entered content. Sanitized Assistant gaps are handled by
 * the server separately.
 */
export const PRODUCT_EVENTS = [
  'session_started', 'tab_opened', 'frame_preview_opened',
  'assistant_opened', 'assistant_request_completed', 'assistant_request_needs_input',
  'assistant_request_unsupported', 'assistant_request_error', 'reminder_created',
  'grocery_item_added', 'recipe_created', 'recipe_added_to_groceries', 'dinner_plan_opened',
  'surf_opened', 'custom_spot_started', 'custom_spot_completed', 'layout_selected',
  'frame_update_requested', 'theme_changed', 'language_changed', 'connection_started',
  'connection_completed', 'connection_failed',
]

const EVENT_SET = new Set(PRODUCT_EVENTS)
const SESSION_KEY = 'remind.analytics.session.v1'
const CLIENT_INSTALL_KEY = 'remind.analytics.client-install.v1'
export const ANALYTICS_INACTIVITY_MS = 30 * 60 * 1000
const SAFE_KEYS = new Set(['tab', 'provider', 'recurring', 'layoutType', 'capabilityId', 'helpTopicId', 'resolver', 'followupCount', 'outcome', 'errorType'])
const SAFE_ENUMS = {
  tab: new Set(['frame', 'settings', 'assistant', 'date', 'weather', 'surf', 'reminders', 'countdown', 'soccer', 'stocks', 'groceries']),
  provider: new Set(['spond', 'teams', 'calendar', 'local_events']),
  layoutType: new Set(['built_in', 'custom']), resolver: new Set(['deterministic', 'ai']),
  outcome: new Set(['completed', 'needs_input', 'unsupported', 'error']),
}

export function safeAnalyticsMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const clean = {}
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_KEYS.has(key)) continue
    if (key === 'recurring' && typeof item === 'boolean') clean[key] = item
    else if (key === 'followupCount' && Number.isInteger(item) && item >= 0 && item <= 100) clean[key] = item
    else if (SAFE_ENUMS[key] && typeof item === 'string' && SAFE_ENUMS[key].has(item)) clean[key] = item
    else if ((key === 'capabilityId' || key === 'helpTopicId') && typeof item === 'string' && item.length <= 80 && /^[a-z][a-z0-9_.:-]*$/.test(item)) clean[key] = item
    else if (key === 'errorType' && typeof item === 'string' && item.length <= 40 && /^[a-z][a-z0-9_-]*$/.test(item)) clean[key] = item
  }
  return clean
}

export function isProductEvent(value) { return typeof value === 'string' && EVENT_SET.has(value) }
const randomId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function getAnalyticsSession(storage, now = Date.now()) {
  let previous = null
  try { previous = JSON.parse(storage.getItem(SESSION_KEY) || 'null') } catch {}
  const reused = !!previous && typeof previous.id === 'string' && Number.isFinite(previous.lastActive) && now - previous.lastActive < ANALYTICS_INACTIVITY_MS
  const session = { id: reused ? previous.id : randomId(), lastActive: now }
  storage.setItem(SESSION_KEY, JSON.stringify(session))
  return { ...session, started: !reused }
}

function clientInstallId(storage) {
  const existing = storage.getItem(CLIENT_INSTALL_KEY)
  if (existing) return existing
  const id = randomId(); storage.setItem(CLIENT_INSTALL_KEY, id); return id
}

export function trackProductEvent({ event, surface, source, metadata }, options = {}) {
  if (!isProductEvent(event) || typeof window === 'undefined') return
  const clean = safeAnalyticsMetadata(metadata)
  const session = getAnalyticsSession(window.localStorage)
  const payload = { event, sessionId: session.id, clientInstallId: clientInstallId(window.localStorage), ...(typeof surface === 'string' && surface.length <= 40 ? { surface } : {}), ...(source === 'manual' || source === 'assistant' ? { source } : {}), metadata: clean }
  const send = options.send || ((body) => fetch('/api/analytics/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true }))
  // Deliberately detached: telemetry can never delay or reject a product action.
  Promise.resolve().then(() => send(payload)).catch(() => {})
}

export function initializeProductAnalytics() {
  if (typeof window === 'undefined') return () => {}
  const startIfNeeded = () => {
    const session = getAnalyticsSession(window.localStorage)
    if (session.started) trackProductEvent({ event: 'session_started', surface: 'app' })
  }
  startIfNeeded()
  const foreground = () => { if (document.visibilityState === 'visible') startIfNeeded() }
  document.addEventListener('visibilitychange', foreground)
  return () => document.removeEventListener('visibilitychange', foreground)
}
