import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  clearManualUpdate,
  readManualUpdate,
  selectUpdatePresentation,
  manualUpdateEstimate,
  writeManualUpdate,
} from '../app/lib/device/manualUpdateState.ts'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

test('manual update survives tab navigation and always wins presentation until completion', () => {
  const storage = memoryStorage()
  const deviceId = 'frame-a'
  const now = 1_000_000
  const scheduled = 'Update in 12 minutes'
  const states = []

  // idle scheduled state -> press Update -> manual update active
  assert.equal(selectUpdatePresentation(false, 'manual', scheduled), scheduled)
  writeManualUpdate(storage, deviceId, {
    phase: 'updating', requestId: 'request-7', requestedRevision: 7, requestedAt: now,
    deadline: now + 180_000,
  })

  // Navigate away and synchronously restore before the Frame subtree mounts.
  const restored = readManualUpdate(storage, deviceId)
  assert.ok(restored)
  states.push(selectUpdatePresentation(Boolean(restored), 'Update in less than 2 minutes', scheduled))

  // Reconciliation progresses through every estimate without exposing scheduled copy.
  states.push(selectUpdatePresentation(true, 'Update in less than 1 minute', scheduled))
  states.push(selectUpdatePresentation(true, 'Update in less than 30 seconds', scheduled))
  states.push(selectUpdatePresentation(true, 'Update in less than 15 seconds', scheduled))
  clearManualUpdate(storage, deviceId)
  states.push(selectUpdatePresentation(true, 'Updated just now', scheduled))

  assert.deepEqual(states, [
    'Update in less than 2 minutes', 'Update in less than 1 minute', 'Update in less than 30 seconds',
    'Update in less than 15 seconds', 'Updated just now',
  ])
  assert.doesNotMatch(states.join('\n'), /Update in 12 minutes/)
})

test('accepted backend operation outlives Frame unmount and remount does not request twice', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260811130000_add_device_update_request_ledger.sql', import.meta.url), 'utf8')
  const requestRoute = readFileSync(new URL('../app/api/device/update-state/request/route.ts', import.meta.url), 'utf8')
  const firmware = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

  // The accepted request is a durable revision. Repeating the same operation
  // identifier (for example after an ambiguous response) returns that revision
  // instead of incrementing it a second time.
  assert.match(migration, /primary key \(device_id, request_id\)/)
  assert.match(migration, /from public\.device_update_state[\s\S]*for update/)
  assert.match(migration, /select requested_revision into result[\s\S]*from public\.device_update_requests/)
  assert.match(migration, /if result is not null then[\s\S]*return result/)
  assert.match(migration, /set requested_revision = requested_revision \+ 1,[\s\S]*requested_at = clock_timestamp\(\)/)
  assert.match(requestRoute, /p_request_id: requestId/)
  const handler = home.slice(home.indexOf('async function handleExplicitUpdate'), home.indexOf('async function logout'))
  assert.equal(handler.match(/crypto\.randomUUID\(\)/g)?.length, 1)
  assert.match(handler, /const requestId = crypto\.randomUUID\(\)[\s\S]*requestDeviceUpdate\(supabase, deviceId, requestId\)/)

  // Device execution depends on the backend revision, not an app component or
  // active browser heartbeat. A sleeping device still renders pending work.
  assert.match(firmware, /const bool explicitRevisionPending =[\s\S]*requestedRevision > liveState\.displayedRevision/)
  assert.match(firmware, /!normalSyncDue && !explicitRevisionPending &&/)

  // Frame/tab cleanup only stops observers. It cannot clear or mutate the
  // authoritative backend revision, and recovery performs status GETs only.
  const reconcile = home.slice(home.indexOf('useEffect(() => {', home.indexOf('restoreManualUpdateState(activeDeviceId)')), home.indexOf('// Resolve this'))
  assert.doesNotMatch(reconcile, /requestDeviceUpdate|fetch\([^)]*request|AbortController/)
  assert.doesNotMatch(reconcile, /activeTab/)
  assert.match(reconcile, /getDeviceUpdateStatus/)
  assert.match(home, /disabled=\{!activeDeviceId \|\| persisting \|\| manualUpdatePending\}/)
  assert.doesNotMatch(home, /unconfirmed|DEVICE_UPDATE_UNCONFIRMED_POLL_MS/)
})

test('Frame navigation restores before selection and never resets on activeTab changes', () => {
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const navigation = home.slice(home.indexOf('async function handleSelectTab'), home.indexOf("if (isPhoneLandscapeMirror)"))
  assert.ok(navigation.indexOf('restoreManualUpdateState(activeDeviceId)') < navigation.indexOf('setActiveTab(k)'))
  const reset = home.slice(home.indexOf('updateOperationIdRef.current += 1'), home.indexOf('// Resolve this'))
  assert.doesNotMatch(reset, /\[activeDeviceId, activeTab, userId\]/)
  assert.match(home, /selectUpdatePresentation\(\s*manualUpdatePresentationActive \|\| !manualUpdateStateResolved/)
})

test('coarse estimate is derived from elapsed wall-clock time and expires at two minutes', () => {
  const start = 5_000_000
  assert.equal(manualUpdateEstimate(start, start), 'under2')
  assert.equal(manualUpdateEstimate(start, start + 60_000), 'under1')
  assert.equal(manualUpdateEstimate(start, start + 90_000), 'under30')
  assert.equal(manualUpdateEstimate(start, start + 105_000), 'under15')
  assert.equal(manualUpdateEstimate(start, start + 120_000), null)
})
