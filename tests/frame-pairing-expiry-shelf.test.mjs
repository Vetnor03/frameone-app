import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const frameLoop = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')
const pairingScreen = readFileSync(new URL('../frame/src/display/ScreenPairing.cpp', import.meta.url), 'utf8')
const pairingHeader = readFileSync(new URL('../frame/src/display/ScreenPairing.h', import.meta.url), 'utf8')

test('expired pairing falls back to passive shelf instead of setup stopped error', () => {
  assert.match(frameLoop, /enum PairingResult/)
  assert.match(frameLoop, /PAIRING_EXPIRED/)
  assert.match(frameLoop, /Pairing window expired without a claim; entering passive pairing shelf/)
  assert.match(frameLoop, /showPairingShelfAndSleep\(pwrEarly\.usbPresent\)/)
  assert.match(frameLoop, /goToShelfSleep\(usbPresent\)/)

  const expiredBranchIndex = frameLoop.indexOf('if (pairing == PAIRING_EXPIRED)')
  const setupStoppedIndex = frameLoop.indexOf('ScreenPairing::showError("Could not pair frame")', expiredBranchIndex)
  assert.ok(expiredBranchIndex >= 0 && setupStoppedIndex > expiredBranchIndex)
  assert.ok(frameLoop.slice(expiredBranchIndex, setupStoppedIndex).includes('showPairingShelfAndSleep'))
})

test('pairing shelf screen uses passive ready-to-pair copy', () => {
  assert.match(pairingHeader, /showPairingShelf/)
  assert.match(pairingScreen, /Ready to pair/)
  assert.match(pairingScreen, /Plug in \/ restart to generate/)
  assert.match(pairingScreen, /a new pairing code/)
})

test('pairing shelf does not immediately request a fresh code after unplug wake', () => {
  assert.match(frameLoop, /pair_shelf/)
  assert.match(frameLoop, /Pairing shelf wake without charger reconnect -> stay passive/)
  assert.match(frameLoop, /isDeepSleepWake\(\) && !pwrEarly\.usbPresent/)

  const passiveWakeIndex = frameLoop.indexOf('Pairing shelf wake without charger reconnect -> stay passive')
  const nextPairStartIndex = frameLoop.indexOf('ensurePairedNoReboot(chargerStateChanged)', passiveWakeIndex)
  assert.ok(passiveWakeIndex >= 0 && nextPairStartIndex > passiveWakeIndex)
  assert.ok(frameLoop.slice(passiveWakeIndex, nextPairStartIndex).includes('showPairingShelfAndSleep(pwrEarly.usbPresent)'))
})
