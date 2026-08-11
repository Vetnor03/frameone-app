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
    phase: 'updating', requestedRevision: 7, requestedAt: now,
    deadline: now + 180_000, estimate: { displayAt: null, instant: false },
  })

  // Navigate away and synchronously restore before the Frame subtree mounts.
  const restored = readManualUpdate(storage, deviceId, now + 1)
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

test('Frame navigation restores before selection and never resets on activeTab changes', () => {
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const navigation = home.slice(home.indexOf('async function handleSelectTab'), home.indexOf("if (isPhoneLandscapeMirror)"))
  assert.ok(navigation.indexOf('restoreManualUpdateState(activeDeviceId)') < navigation.indexOf('setActiveTab(k)'))
  const reset = home.slice(home.indexOf('updateOperationIdRef.current += 1'), home.indexOf('// Resolve this'))
  assert.doesNotMatch(reset, /\[activeDeviceId, activeTab, userId\]/)
  assert.match(home, /selectUpdatePresentation\(\s*manualUpdatePresentationActive \|\| !manualUpdateStateResolved/)
})
