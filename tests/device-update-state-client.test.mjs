import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../app/lib/device/updateStateClient.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const manual = readFileSync(new URL('../app/lib/device/manualUpdateState.ts', import.meta.url), 'utf8')

test('selected Frame tab heartbeats every 45 seconds and pauses while hidden', () => {
  assert.match(client, /DEVICE_ACTIVITY_HEARTBEAT_MS = 45_000/)
  assert.match(home, /activeTab !== 'frame'/)
  assert.match(home, /sendDeviceActivity\(supabase, activeDeviceId\)/)
  assert.match(home, /document\.visibilityState !== 'visible'/)
  assert.match(home, /window\.clearInterval\(heartbeatTimer\)/)
  assert.match(home, /\[activeDeviceId, activeTab, userId\]/)
  assert.doesNotMatch(client, /upsert_device_settings|request_device_display_revision/)
})

test('activity, request, and status use the selected device and bearer session', () => {
  assert.match(client, /supabase\.auth\.getSession\(\)/)
  assert.match(client, /Authorization: `Bearer \$\{token\}`/)
  assert.match(client, /activity[\s\S]*JSON\.stringify\(\{ device_id: deviceId \}\)/)
  assert.match(client, /request[\s\S]*JSON\.stringify\(\{ device_id: deviceId \}\)/)
  assert.match(client, /status\?device_id=\$\{encodeURIComponent\(deviceId\)\}/)
})

test('explicit Update saves before requesting and locks duplicate clicks', () => {
  const flow = home.slice(home.indexOf('async function handleExplicitUpdate'), home.indexOf('async function logout'))
  assert.ok(flow.indexOf('persistSettings(deviceId)') < flow.indexOf('requestDeviceUpdate(supabase, deviceId)'))
  assert.match(flow, /if \(!saved[^)]*\)[\s\S]*return/)
  assert.match(flow, /updateActionInFlightRef\.current/)
  assert.match(home, /disabled=\{!activeDeviceId \|\| persisting \|\| manualUpdateInProgress\}/)
  assert.ok(flow.indexOf("phase: 'manual_waiting'") < flow.indexOf('persistSettings(deviceId)'))
})

test('reconciliation waits for the exact returned revision and has a three-minute bound', () => {
  assert.match(client, /DEVICE_UPDATE_TIMEOUT_MS = 3 \* 60_000/)
  assert.match(client, /return displayedRevision >= requestedRevision/)
  assert.match(home, /requestedRevision = await requestDeviceUpdate/)
  assert.match(home, /status\.displayedRevision >= requestedRevision/)
  assert.match(home, /window\.setInterval\(reconcile, 3_000\)/)
  assert.match(home, /phase: 'manual_failed'/)
})

test('frame/tab/auth changes invalidate stale Update operations', () => {
  assert.match(home, /updateOperationIdRef\.current \+= 1/)
  assert.match(home, /activeDeviceIdRef\.current !== deviceId/)
  assert.match(home, /loadManualUpdateRecords/)
  assert.match(home, /persistManualUpdateRecords/)
})

test('network errors retain durable state and request failures are visible', () => {
  assert.match(home, /local record remains visually authoritative through transient offline periods/)
  assert.match(manual, /Update saved\. RE:MIND has not confirmed the display refresh yet\./)
  assert.match(home, /Settings were saved, but the update could not be started\./)
  assert.match(manual, /window\.localStorage\.setItem/)
})
