import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('Settings exposes an immediate-save Power Save toggle', () => {
  assert.match(source, /powerSaver\?: boolean/)
  assert.match(source, /const \[powerSaver, setPowerSaver\] = useState\(false\)/)
  assert.match(source, /async function handlePowerSaverChange\(next: boolean\)/)
  assert.match(source, /performSettingsSave\(deviceId, \{ powerSaver: next \}\)/)
  assert.match(source, /requestDeviceUpdate\(supabase, deviceId, crypto\.randomUUID\(\)\)/)
  assert.match(source, /checked=\{powerSaver\}/)
  assert.match(source, /Deep sleep between planned updates\. No live updates/)
})

test('Power Save is part of the durable frame settings draft and dirty-state signature', () => {
  assert.match(source, /powerSaver: args\.powerSaver/)
  assert.match(source, /powerSaver: draftPowerSaver/)
  assert.match(source, /const nextPowerSaver = json\.powerSaver === true/)
  assert.match(source, /markDirty\(\{ powerSaver: next \}\)/)
})
