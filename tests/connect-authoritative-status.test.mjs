import test from 'node:test'
import assert from 'node:assert/strict'
import {
  connectStatusCacheKey, readConnectStatusCache, writeConnectStatusCache,
  clearConnectStatusCacheForUser, resolveConnectBadge, CONNECT_STATUS_CACHE_PREFIX,
} from '../app/lib/integrations/connectStatusCache.mjs'

function storage() {
  const data = new Map()
  return {
    get length() { return data.size },
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    key: index => [...data.keys()][index] || null,
  }
}
const USER = 'test-user-1234', DEVICE = 'test-device-4321'

test('server-authorized Google Tasks is connected even when not enabled on a frame', () => {
  const args = { verified: true, cached: false, accountConnected: true, frameEnabled: false }
  assert.equal(resolveConnectBadge(args), true)
  assert.equal(resolveConnectBadge({ ...args, verified: undefined }), true)
})

test('OAuth-like account statuses for all providers do not rely on frame selection', () => {
  for (const provider of ['google-tasks', 'todoist', 'microsoft-todo', 'google-calendar', 'teams', 'calendar-link']) {
    assert.equal(resolveConnectBadge({ accountConnected: true, frameEnabled: false }), true, provider)
  }
})

test('authoritative disconnect overrides an old positive cache', () => {
  assert.equal(resolveConnectBadge({ verified: false, cached: true, accountConnected: false }), false)
  assert.equal(resolveConnectBadge({ verified: true, cached: true, locallyDisconnected: true }), false)
})

test('new-frame onboarding still requires opt-in, even if account authorized', () => {
  const connected = { startup: true, verified: undefined, accountConnected: true, frameEnabled: false }
  assert.equal(resolveConnectBadge(connected), false)
  assert.equal(resolveConnectBadge({ ...connected, frameEnabled: true }), true)
})

test('only an eligible, connected provider is displayed, with cached display fallback', () => {
  assert.equal(resolveConnectBadge({ connectable: false, verified: true }), false)
  assert.equal(resolveConnectBadge({ accountConnected: false, cached: true }), true)
  assert.equal(resolveConnectBadge({ accountConnected: false, cached: undefined }), false)
})

test('account/device scoped cache includes Calendar Link and rejects older cache keys', () => {
  const store = storage()
  const key = connectStatusCacheKey(USER, DEVICE)
  assert.ok(key?.startsWith(CONNECT_STATUS_CACHE_PREFIX))
  assert.ok(key?.includes(':v2:'))
  store.setItem('remind:connect-status:v1:' + USER + ':' + DEVICE, JSON.stringify({
    version: 1, userId: USER, deviceId: DEVICE,
    savedAt: Date.now(), connections: { 'google-tasks': false },
  }))
  assert.deepEqual(readConnectStatusCache(store, USER, DEVICE), {})
  assert.equal(writeConnectStatusCache(store, USER, DEVICE, 'calendar-link', true), true)
  assert.equal(writeConnectStatusCache(store, USER, DEVICE, 'google-tasks', true), true)
  assert.deepEqual(readConnectStatusCache(store, USER, DEVICE), { 'calendar-link': true, 'google-tasks': true })
  assert.deepEqual(readConnectStatusCache(store, USER, 'other-device-5678'), {})
  clearConnectStatusCacheForUser(store, USER)
  assert.deepEqual(readConnectStatusCache(store, USER, DEVICE), {})
})
