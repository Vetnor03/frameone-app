import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const frame = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')
const display = readFileSync(new URL('../frame/src/display/DisplayCore.cpp', import.meta.url), 'utf8')
const header = readFileSync(new URL('../frame/src/display/DisplayCore.h', import.meta.url), 'utf8')

const start = display.indexOf('void drawShelfScreen()')
const shelf = display.slice(start, display.indexOf('} // namespace DisplayCore', start))

test('customer shelf screen contains only the centered logo, welcome and clear setup instruction', () => {
  assert.ok(start >= 0)
  assert.match(shelf, /const char\* line1 = "RE:MIND"/)
  assert.match(shelf, /const char\* line2 = "Welcome"/)
  assert.match(shelf, /const char\* line3 = "Plug in the charging cable to begin setup"/)
  assert.match(shelf, /FRAME_X \+ \(FRAME_W - \(int\)w\) \/ 2 - x1/)
  assert.match(shelf, /FRAME_Y \+ FRAME_H \/ 2/)
  assert.match(shelf, /FRAME_Y \+ FRAME_H - 42/)
  assert.doesNotMatch(shelf, /deviceId|device_id|frame id|idLine|print\(.*[Ii][Dd]\)/)
  assert.doesNotMatch(shelf, /plug in the frame|Plug in USB to wake/)
})

test('shelf screen uses no device ID argument, but firmware logs exact label ID on every boot', () => {
  assert.match(header, /void drawShelfScreen\(\);/)
  assert.match(frame, /DisplayCore::drawShelfScreen\(\);/)
  assert.doesNotMatch(frame, /drawShelfScreen\(DeviceIdentity::getDeviceId\(\)\)/)
  assert.match(frame, /Serial\.print\("RE:MIND BACK LABEL - Frame ID: "\);\s*Serial\.println\(DeviceIdentity::getDeviceId\(\)\);/)
  assert.match(frame, /Serial\.print\("device_id: "\);\s*Serial\.println\(DeviceIdentity::getDeviceId\(\)\);/)
  assert.ok(frame.indexOf('RE:MIND BACK LABEL - Frame ID: ') < frame.indexOf('DisplayCore::drawShelfScreen();'))
})

test('shelf remains asleep until charger reconnect; no onboarding behavior is altered', () => {
  assert.match(frame, /if \(!pwrEarly\.usbPresent\) \{[\s\S]*?DisplayCore::drawShelfScreen\(\);[\s\S]*?goToShelfSleep\(pwrEarly\.usbPresent\)/)
  assert.match(frame, /EXT1 target: wake on USB plug in/)
})
