import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  clearManualUpdate,
  readManualUpdate,
  selectUpdatePresentation,
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
    deadline: now + 180_000, estimate: { displayAt: null, instant: false },
  })

  // Navigate away and synchronously restore before the Frame subtree mounts.
  const restored = readManualUpdate(storage, deviceId)
  assert.ok(restored)
  states.push(selectUpdatePresentation(Boolean(restored), 'Update in less than 2 minutes', scheduled))

  // Reconciliation progresses through every estimate without exposing scheduled copy.
  states.push(selectUpdatePresentation(true, 'Update in 59 seconds', scheduled))
  states.push(selectUpdatePresentation(true, 'Update in 29 seconds', scheduled))
  states.push(selectUpdatePresentation(true, 'Update in less than 15 seconds', scheduled))
  clearManualUpdate(storage, deviceId)
  states.push(selectUpdatePresentation(true, 'Updated just now', scheduled))

  assert.deepEqual(states, [
    'Update in less than 2 minutes', 'Update in 59 seconds', 'Update in 29 seconds',
    'Update in less than 15 seconds', 'Updated just now',
  ])
  assert.doesNotMatch(states.join('\n'), /Update in 12 minutes/)
})

test('accepted backend operation outlives Frame unmount and remount does not request twice', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260811120000_make_device_updates_durable.sql', import.meta.url), 'utf8')
  const requestRoute = readFileSync(new URL('../app/api/device/update-state/request/route.ts', import.meta.url), 'utf8')
  const firmware = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

  // The accepted request is a durable revision. Repeating the same operation
  // identifier (for example after an ambiguous response) returns that revision
  // instead of incrementing it a second time.
  assert.match(migration, /when device_update_state\.request_id = excluded\.request_id[\s\S]*then device_update_state\.requested_revision/)
  assert.match(migration, /requested_at = case[\s\S]*then device_update_state\.requested_at/)
  assert.match(requestRoute, /p_request_id: requestId/)

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
  assert.match(home, /explicitUpdateStatus === 'unconfirmed'\) return/)
})

test('Frame navigation restores before selection and never resets on activeTab changes', () => {
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const navigation = home.slice(home.indexOf('async function handleSelectTab'), home.indexOf("if (isPhoneLandscapeMirror)"))
  assert.ok(navigation.indexOf('restoreManualUpdateState(activeDeviceId)') < navigation.indexOf('setActiveTab(k)'))
  const reset = home.slice(home.indexOf('updateOperationIdRef.current += 1'), home.indexOf('// Resolve this'))
  assert.doesNotMatch(reset, /\[activeDeviceId, activeTab, userId\]/)
  assert.match(home, /selectUpdatePresentation\(\s*manualUpdatePresentationActive \|\| !manualUpdateStateResolved/)
})
