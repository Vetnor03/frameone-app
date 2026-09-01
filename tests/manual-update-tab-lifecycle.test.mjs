import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const state = readFileSync(new URL('../app/lib/device/manualUpdateState.ts', import.meta.url), 'utf8')

test('accepted manual operation persists its exact request id and revision across tabs', () => {
  assert.match(home, /requestId: crypto\.randomUUID\(\)|const requestId = crypto\.randomUUID\(\)/)
  assert.match(home, /requestedRevision = await requestDeviceUpdate\(supabase, deviceId, requestId\)/)
  assert.match(home, /writeManualUpdate\(window\.localStorage, deviceId, persistedUpdate\)/)
  assert.match(state, /requestedRevision: number \| null/)
})

test('recovery observes only the exact accepted revision and never republishes', () => {
  const begin = home.indexOf('const persisted = readManualUpdate')
  const end = home.indexOf('async function performSettingsSave')
  const recovery = home.slice(begin, end)
  assert.match(recovery, /const requestedRevision = update\.requestedRevision/)
  assert.match(recovery, /revisionHasBeenDisplayed\(backend\.displayedRevision, requestedRevision\)/)
  assert.doesNotMatch(recovery, /requestDeviceUpdate|requestManualUpdateRevision/)
})
