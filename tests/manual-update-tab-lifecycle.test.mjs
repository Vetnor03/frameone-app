import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readManualUpdate, requestManualUpdateRevision, writeManualUpdate } from '../app/lib/device/manualUpdateState.ts'

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
  assert.match(home, /requestManualUpdateRevision\([\s\S]*update\.requestId[\s\S]*requestDeviceUpdate\(supabase, deviceId, requestId\)/)
  assert.doesNotMatch(home, /backend\.requestedRevision > backend\.displayedRevision/)
})

test('ambiguous response retries the same request ID and allocates one revision', async () => {
  const ledger = new Map()
  let nextRevision = 0
  let calls = 0
  const request = async (requestId) => {
    calls += 1
    if (!ledger.has(requestId)) ledger.set(requestId, ++nextRevision)
    if (calls === 1) throw new Error('response_lost')
    return ledger.get(requestId)
  }
  const revision = await requestManualUpdateRevision('exact-request-X', 10_000, request, {
    now: () => 0,
    sleep: async () => undefined,
  })
  assert.equal(revision, 1)
  assert.equal(calls, 2)
  assert.equal(ledger.size, 1)
  assert.match(home, /phase: 'waiting_for_display',[\s\S]*requestedRevision/)
})

test('several transient request failures retry until success', async () => {
  let attempts = 0
  const ids = []
  const revision = await requestManualUpdateRevision('same-request-X', 10_000, async (id) => {
    ids.push(id)
    if (++attempts < 4) throw new Error('offline')
    return 7
  }, { now: () => 0, sleep: async () => undefined })
  assert.equal(revision, 7)
  assert.deepEqual(ids, Array(4).fill('same-request-X'))
})

test('request acceptance timeout returns null without changing physical freshness', async () => {
  let now = 0
  const revision = await requestManualUpdateRevision('same-request-X', 2_500, async () => {
    throw new Error('offline')
  }, {
    now: () => now,
    sleep: async (milliseconds) => { now += milliseconds },
    retryDelayMs: 1_000,
  })
  assert.equal(revision, null)
  assert.match(home, /requestedRevision == null[\s\S]*clearManualUpdate[\s\S]*setExplicitUpdateStatus\('idle'\)/)
  assert.doesNotMatch(home, /requestedRevision == null[\s\S]{0,500}setLastPhysicalDisplayUpdatedAt/)
})

test('request state is persisted only after settings save succeeds', () => {
  const flow = home.slice(home.indexOf('async function handleExplicitUpdate'), home.indexOf('async function logout'))
  assert.ok(flow.indexOf('await persistSettings(deviceId)') < flow.indexOf('writeManualUpdate(window.localStorage'))
  assert.ok(flow.indexOf('writeManualUpdate(window.localStorage') < flow.indexOf('requestManualUpdateRevision('))
})

test('freshness is physical and remains separate from timeout errors', () => {
  assert.match(home, /const updateStatusText = lastPhysicalDisplayUpdatedAt/)
  assert.match(home, /last_render_at/)
  assert.doesNotMatch(home, /MANUAL_UPDATE_VISIBLE_MS|Update in less than|next update/i)
  assert.match(home, /role="alert"[\s\S]*frameUpdateError[\s\S]*updateStatusText/)
})
