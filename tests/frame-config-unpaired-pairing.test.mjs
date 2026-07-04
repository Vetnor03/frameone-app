import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const builder = readFileSync(new URL('../app/api/device/frame-config/builder.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/device/frame-config/route.ts', import.meta.url), 'utf8')
const frameConfig = readFileSync(new URL('../frame/src/core/FrameConfig.cpp', import.meta.url), 'utf8')
const frameLoop = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')

test('frame-config returns an explicit unpaired payload with pairing fields', () => {
  assert.match(builder, /status: 'unpaired'/)
  assert.match(builder, /pair_required: true/)
  assert.match(builder, /pairing_code\?: string/)
  assert.match(route, /start_pairing/)
  assert.match(route, /pairing_code/)
})

test('firmware handles unpaired frame-config before generic setup error', () => {
  assert.match(frameConfig, /FETCH_UNPAIRED/)
  assert.match(frameConfig, /doc\["pair_required"\] == true/)
  assert.match(frameConfig, /DeviceIdentity::clearToken\(\)/)
  assert.match(frameLoop, /frame-config unpaired/)
  assert.match(frameLoop, /ScreenPairing::showError\("Could not load frame"\)/)
  assert.ok(frameLoop.indexOf('frame-config unpaired') < frameLoop.indexOf('ScreenPairing::showError("Could not load frame")'))
})
