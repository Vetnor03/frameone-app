import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const builder = readFileSync(new URL('../app/api/device/frame-config/builder.ts', import.meta.url), 'utf8')
const frameConfigRoute = readFileSync(new URL('../app/api/device/frame-config/route.ts', import.meta.url), 'utf8')
const mirrorRoute = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
const firmware = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')

test('physical frame config omits Assistant cells without changing saved settings or Mirror View', () => {
  assert.match(builder, /target\?: 'firmware' \| 'mirror'/)
  assert.match(builder, /options\.target === 'mirror' \? rawCells : physicalCells/)
  assert.match(builder, /rawCells\.filter/)
  assert.doesNotMatch(builder, /module: ''/)
  assert.match(frameConfigRoute, /buildFrameConfigPayload\(supabase, device_id\)/)
  assert.match(mirrorRoute, /buildFrameConfigPayload\(supabase, deviceId, \{ target: 'mirror' \}\)/)
})

test('compatibility fix does not require a physical firmware Assistant module', () => {
  assert.doesNotMatch(firmware, /ModuleAssistant/)
  assert.doesNotMatch(builder, /settings_json\.cells\s*=/)
})
