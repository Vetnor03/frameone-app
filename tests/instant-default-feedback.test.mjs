import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { confirmFrameSaveForRevision, frameSaveFeedbackPhase } from '../app/lib/device/frameSaveFeedback.mjs'
import { clearManualUpdate, readManualUpdate, writeManualUpdate } from '../app/lib/device/manualUpdateState.ts'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const onboarding = home.slice(home.indexOf('  async function completeFrameSetup('), home.indexOf('  async function customLayoutRequest('))
const settingsSave = home.slice(home.indexOf('  async function performSettingsSave('), home.indexOf('  async function handlePowerSaverChange('))
const update = home.slice(home.indexOf('  async function runExplicitUpdate('), home.indexOf('  async function logout()'))

test('fresh frame onboarding defaults to responsive Instant mode, without resetting existing saved modes', () => {
  assert.match(home, /const DEFAULT_POWER_SAVER = false/)
  assert.match(home, /\[powerSaver, setPowerSaver\] = useState\(DEFAULT_POWER_SAVER\)/)
  assert.match(home, /const nextPowerSaver = json\.powerSaver === true \? true : DEFAULT_POWER_SAVER/)
  assert.match(onboarding, /powerSaver: DEFAULT_POWER_SAVER,/)
  assert.match(onboarding, /setPowerSaver\(DEFAULT_POWER_SAVER\)/)
  assert.match(home, /setPowerSaver\(nextPowerSaver\)/)
  assert.match(home, /const draftPowerSaver = overrides\.powerSaver \?\? powerSaver/)
  assert.doesNotMatch(home, /setPowerSaver\(false\)[\s\S]*setExplicitUpdateStatus\('requesting'\)/)
})

test('Instant manual updates request a revision and wait for physical confirmation', () => {
  assert.match(update, /if \(powerSaver\) \{[\s\S]*return\s*\}/)
  assert.match(update, /requestedRevision = await requestDeviceUpdate\(supabase, deviceId, requestId\)/)
  assert.match(update, /writeManualUpdate\(window\.localStorage, deviceId, persistedUpdate\)/)
  assert.match(update, /revisionHasBeenDisplayed\(updateStatus\.displayedRevision, operation\.requestedRevision\)/)
  assert.match(update, /confirmFrameSaveOnRevision\(deviceId, savedAtForRevision\)/)
  assert.match(update, /await refreshPhysicalFrameState\(deviceId, \{ forceSnapshot: true \}\)/)
  assert.match(home, /confirmFrameSaveOnRevision\(deviceId, update\.savedAt\)/)
})

test('server timestamps are used for Instant save feedback instead of phone timestamps', () => {
  assert.match(settingsSave, /const savedResult = await saveFrameSettings/)
  assert.match(settingsSave, /typeof savedResult\.updated_at !== 'string'/)
  assert.match(settingsSave, /const savedAt = savedResult\.updated_at/)
  assert.doesNotMatch(settingsSave, /const savedAt = new Date\(\)\.toISOString\(\)/)
})

test('ACK confirms only exact saved revision and never a more recent save', () => {
  const waiting = { deviceId: 'frame-a', savedAt: '2026-10-15T14:00:00Z', phase: 'waiting' }
  assert.deepEqual(confirmFrameSaveForRevision(waiting, 'frame-a', waiting.savedAt), {
    ...waiting, phase: 'confirmed'
  })
  assert.equal(confirmFrameSaveForRevision(waiting, 'frame-b', waiting.savedAt), waiting)
  assert.equal(confirmFrameSaveForRevision(waiting, 'frame-a', '2026-10-15T14:01:00Z'), waiting)
  assert.equal(confirmFrameSaveForRevision(waiting, 'frame-a', null), waiting)
  assert.equal(confirmFrameSaveForRevision({ ...waiting, phase: 'confirmed' }, 'frame-a', waiting.savedAt).phase, 'confirmed')
  assert.equal(frameSaveFeedbackPhase(waiting.savedAt, null), 'waiting')
})

test('in-flight update recovery retains exact save ID and accepts older persisted records', () => {
  const state = new Map()
  const storage = {
    getItem(key) { return state.get(key) ?? null },
    setItem(key, value) { state.set(key, value) },
    removeItem(key) { state.delete(key) },
  }
  const pending = {
    phase: 'waiting_for_display', requestId: 'abcdefgh', requestedRevision: 42,
    requestedAt: 1000, deadline: 1000000, savedAt: '2026-10-15T14:00:00Z',
  }
  writeManualUpdate(storage, 'frame-a', pending)
  assert.deepEqual(readManualUpdate(storage, 'frame-a'), pending)
  writeManualUpdate(storage, 'frame-b', { ...pending, savedAt: undefined })
  assert.equal(readManualUpdate(storage, 'frame-b')?.savedAt, undefined)
  clearManualUpdate(storage, 'frame-a')
  assert.equal(readManualUpdate(storage, 'frame-a'), null)
})
