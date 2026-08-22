import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readManualUpdate, writeManualUpdate } from '../app/lib/device/manualUpdateState.ts'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

function memoryStorage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
}

test('durable requesting state preserves the exact request ID and null revision', () => {
  const storage = memoryStorage()
  const update = { phase: 'requesting', requestId: 'exact-request-id', requestedRevision: null, requestedAt: 1, deadline: 181001 }
  writeManualUpdate(storage, 'frame-1', update)
  assert.deepEqual(readManualUpdate(storage, 'frame-1'), update)
  assert.match(home, /await requestDeviceUpdate\(supabase, deviceId, update\.requestId\)/)
  assert.doesNotMatch(home, /backend\.requestedRevision > backend\.displayedRevision/)
})

test('request state is persisted only after settings save succeeds', () => {
  const flow = home.slice(home.indexOf('async function handleExplicitUpdate'), home.indexOf('async function logout'))
  assert.ok(flow.indexOf('await persistSettings(deviceId)') < flow.indexOf('writeManualUpdate(window.localStorage'))
  assert.ok(flow.indexOf('writeManualUpdate(window.localStorage') < flow.indexOf('requestDeviceUpdate(supabase, deviceId, requestId)'))
})

test('freshness is physical and remains separate from timeout errors', () => {
  assert.match(home, /const updateStatusText = lastPhysicalDisplayUpdatedAt/)
  assert.match(home, /last_render_at/)
  assert.doesNotMatch(home, /MANUAL_UPDATE_VISIBLE_MS|Update in less than|next update/i)
  assert.match(home, /role="alert"[\s\S]*frameUpdateError[\s\S]*updateStatusText/)
})
