import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('Settings exposes an immediate-save Power Save toggle', () => {
  assert.match(source, /powerSaver\?: boolean/)
  assert.match(source, /const \[powerSaver, setPowerSaver\] = useState\(false\)/)
  assert.match(source, /async function handlePowerSaverChange\(next: boolean\)/)
  assert.match(source, /performSettingsSave\(deviceId, \{ powerSaver: next \}\)/)
  assert.match(source, /if \(!previous && next\)[\s\S]*requestDeviceUpdate\(supabase, deviceId, crypto\.randomUUID\(\)\)/)
  assert.match(source, /checked=\{powerSaver\}/)
  assert.match(source, /Deep sleep between planned updates\. No live updates/)
})

test('Power Save is part of the durable frame settings draft and dirty-state signature', () => {
  assert.match(source, /powerSaver: args\.powerSaver/)
  assert.match(source, /powerSaver: draftPowerSaver/)
  assert.match(source, /const nextPowerSaver = json\.powerSaver === true/)
  assert.match(source, /markDirty\(\{ powerSaver: next \}\)/)
})


test('Frame Update saves without creating a realtime request while Power Save is active', () => {
  const updateFlow = source.slice(source.indexOf('async function runExplicitUpdate'), source.indexOf('function handleSelectTab'))
  assert.match(updateFlow, /if \(powerSaver\)/)
  assert.match(updateFlow, /Saved\. Power Save will apply these changes at the next scheduled wake\./)
  assert.ok(updateFlow.indexOf('if (powerSaver)') < updateFlow.indexOf("setExplicitUpdateStatus('requesting')"))
})
