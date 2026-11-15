import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { frameSaveFeedbackPhase } from '../app/lib/device/frameSaveFeedback.mjs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const setup = home.slice(home.indexOf('function FrameSetupFlow({'), home.indexOf('function FirstFrameOnboarding({'))
const update = home.slice(home.indexOf('  async function runExplicitUpdate('), home.indexOf('  async function logout()'))

test('backend save does not mean frame display confirmed', () => {
  assert.equal(frameSaveFeedbackPhase('2026-10-14T19:00:00Z', null), 'waiting')
  assert.equal(frameSaveFeedbackPhase('2026-10-14T19:00:00Z', '2026-10-14T18:59:59Z'), 'waiting')
  assert.equal(frameSaveFeedbackPhase('2026-10-14T19:00:00Z', '2026-10-14T19:00:00Z'), 'confirmed')
  assert.equal(frameSaveFeedbackPhase('2026-10-14T19:00:00Z', '2026-10-14T19:00:02Z'), 'confirmed')
  assert.equal(frameSaveFeedbackPhase('', null), null)
  assert.equal(frameSaveFeedbackPhase('invalid', '2026-10-14T19:00:02Z'), null)
  assert.equal(frameSaveFeedbackPhase('2026-10-14T19:00:00Z', 'invalid'), 'waiting')
})

test('Power Saver saves without triggering realtime/manual request or rendering success as an error', () => {
  const powerSaver = update.slice(update.indexOf('    if (powerSaver) {'), update.indexOf("    setExplicitUpdateStatus('requesting')"))
  assert.match(powerSaver, /setExplicitUpdateStatus\('idle'\)/)
  assert.doesNotMatch(powerSaver, /requestDeviceUpdate|setFrameUpdateError\(/)
  assert.match(home, /setFrameSaveFeedback\(\{ deviceId, savedAt, phase: 'waiting' \}\)/)
  assert.match(home, /const savedAt = savedResult\.updated_at/)
  assert.match(home, /const savedResult = await saveFrameSettings\(/)
  assert.doesNotMatch(home.slice(home.indexOf('  async function performSettingsSave('), home.indexOf('  async function handlePowerSaverChange(')), /const savedAt = new Date\(\)\.toISOString\(\)/)
  assert.match(home, /confirmFrameSaveOnRender\(deviceId, renderIso \|\| null\)/)
  assert.match(home, /aria-live="polite"/)
  assert.match(home, /Saved · Waiting for next wake/)
  assert.match(home, /Updated on the frame/)
})

test('pending save feedback is recovered from backend settings vs physical render on reload', () => {
  assert.match(home, /rememberPendingFrameUpdate\(settingsUpdatedAt, renderAt\)/)
  assert.match(home, /settingsUpdatedAt && isFrameUpdatePending\(settingsUpdatedAt, renderAt\)/)
  assert.match(home, /phase: 'waiting'/)
  assert.match(home, /frameSaveFeedbackPhase\(current\.savedAt, renderAt\) === 'confirmed'/)
  assert.match(home, /if \(!renderAt \|\| activeDeviceIdRef\.current !== deviceId\) return/)
})

test('first-time setup starts with Weather and Connect; frame editing remains available after', () => {
  assert.match(setup, /useState<'weather' \| 'connect'>/)
  assert.match(setup, /setStep\('connect'\)/)
  assert.match(setup, /<ConnectAppsScreen/)
  assert.doesNotMatch(setup, /setupPurposes|Choose your setup|<FrameLayoutRenderer|customSelection/)
  assert.match(home, /const SHOW_CUSTOM_LAYOUT_UI = true/)
  assert.match(home, /function openPicker\(slot: number\)/)
})
