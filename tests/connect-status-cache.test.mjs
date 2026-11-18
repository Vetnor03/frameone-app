import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CONNECT_STATUS_CACHE_PREFIX,
  CONNECT_STATUS_CACHE_MAX_AGE_MS,
  connectStatusCacheKey,
  readConnectStatusCache,
  writeConnectStatusCache,
  clearConnectStatusCacheForUser,
} from '../app/lib/integrations/connectStatusCache.mjs'

function memoryStorage() {
  const items = new Map()
  return {
    get length() { return items.size },
    key(index) { return [...items.keys()][index] ?? null },
    getItem(key) { return items.get(key) ?? null },
    setItem(key, value) { items.set(key, value) },
    removeItem(key) { items.delete(key) },
  }
}
const userA = 'account-12345678'
const userB = 'account-87654321'
const deviceA = 'device-12345678'
const deviceB = 'device-87654321'

test('Connect cache remembers status and preserves other provider states', () => {
  const storage = memoryStorage()
  assert.equal(writeConnectStatusCache(storage, userA, deviceA, 'teams', true, 10000), true)
  assert.equal(writeConnectStatusCache(storage, userA, deviceA, 'waste', false, 10001), true)
  assert.equal(writeConnectStatusCache(storage, userA, deviceA, 'spond', true, 10002), true)
  assert.deepEqual(readConnectStatusCache(storage, userA, deviceA, 10003),
    { teams: true, waste: false, spond: true })
  writeConnectStatusCache(storage, userA, deviceA, 'teams', false, 10004)
  assert.deepEqual(readConnectStatusCache(storage, userA, deviceA, 10005),
    { teams: false, waste: false, spond: true })
})

test('Connect cache never displays another account or frame connection', () => {
  const storage = memoryStorage()
  writeConnectStatusCache(storage, userA, deviceA, 'google-calendar', true, 10000)
  assert.deepEqual(readConnectStatusCache(storage, userA, deviceB, 10001), {})
  assert.deepEqual(readConnectStatusCache(storage, userB, deviceA, 10001), {})
  assert.deepEqual(readConnectStatusCache(storage, null, deviceA, 10001), {})
  assert.equal(connectStatusCacheKey('invalid', deviceA), null)
})

test('Connect cache rejects stale, malformed and unsupported provider values', () => {
  const storage = memoryStorage()
  writeConnectStatusCache(storage, userA, deviceA, 'bonnetid', true, 10000)
  assert.deepEqual(readConnectStatusCache(storage, userA, deviceA, 10000 + CONNECT_STATUS_CACHE_MAX_AGE_MS + 1), {})
  assert.equal(writeConnectStatusCache(storage, userA, deviceA, 'aladhan', true, 10001), false)
  const key = connectStatusCacheKey(userA, deviceA)
  storage.setItem(key, JSON.stringify({
    version: 1, userId: userA, deviceId: deviceA, savedAt: 10000,
    connections: { teams: true, spond: 'true', aladhan: true },
  }))
  assert.deepEqual(readConnectStatusCache(storage, userA, deviceA, 10001), { teams: true })
  storage.setItem(key, '{broken')
  assert.deepEqual(readConnectStatusCache(storage, userA, deviceA, 10001), {})
})

test('Log out clears only that account\'s Connect cache', () => {
  const storage = memoryStorage()
  writeConnectStatusCache(storage, userA, deviceA, 'spond', true, 10000)
  writeConnectStatusCache(storage, userA, deviceB, 'waste', true, 10000)
  writeConnectStatusCache(storage, userB, deviceA, 'teams', true, 10000)
  clearConnectStatusCacheForUser(storage, userA)
  assert.equal(storage.getItem(CONNECT_STATUS_CACHE_PREFIX + userA + ':' + deviceA), null)
  assert.equal(storage.getItem(CONNECT_STATUS_CACHE_PREFIX + userA + ':' + deviceB), null)
  assert.deepEqual(readConnectStatusCache(storage, userB, deviceA, 10001), { teams: true })
})
