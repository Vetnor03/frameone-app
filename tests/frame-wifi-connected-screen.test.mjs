import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const pairingScreen = await readFile('frame/src/display/ScreenPairing.cpp', 'utf8')
const firmware = await readFile('frame/src/frame_v2.5.1.ino', 'utf8')

test('setup confirms Wi-Fi and explains the update check', () => {
  assert.match(pairingScreen, /"Wi-Fi connected"/)
  assert.match(pairingScreen, /"Checking for updates"/)
  assert.match(pairingScreen, /"This might take a few minutes"/)
})

test('the confirmation is displayed only while completing initial Wi-Fi setup', () => {
  assert.match(
    firmware,
    /isCompletingWifiSetup\s*=\s*\n\s*WiFiManagerV2::hasCreds\(\) && !DeviceIdentity::hasToken\(\)/,
  )
  assert.match(
    firmware,
    /if \(isCompletingWifiSetup\) \{\s*ensureDisplay\(\);\s*ScreenPairing::showWifiConnected\(\);\s*\}/,
  )
})
