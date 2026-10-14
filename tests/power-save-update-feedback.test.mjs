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
  assert.match(home, /const savedAt = new Date\(\)\.toISOString\(\)/)
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

test('Normal and Custom are both first-time options, and Normal carries a subtle recommendation', () => {
  assert.match(setup, /const setupPurposes: SetupPurpose\[\] = \['normal', 'custom'\]/)
  assert.match(setup, /savedDraft\?\.purpose === 'custom' \? 'custom' : 'normal'/)
  assert.match(setup, /savedDraft\?\.step === 'guided' \|\| savedDraft\?\.step === 'custom'/)
  assert.match(setup, /text-\[10px\] font-normal normal-case tracking-normal/)
  assert.match(setup, /Anbefalt' : 'Recommended'/)
  assert.match(setup, /if \(purpose === 'normal'\)/)
  assert.match(setup, /else setStep\('custom'\)/)
  assert.match(setup, /finish\('custom'\)/)
  assert.match(setup, /Open frame editor/)
  assert.doesNotMatch(setup, /const setupPurposes: SetupPurpose\[\] = SHOW_CUSTOM_LAYOUT_UI/)
  // The advanced custom geometry release flag stays off for pilot.
  assert.match(home, /const SHOW_CUSTOM_LAYOUT_UI = false/)
})
