import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../app/lib/device/updateStateClient.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

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
  assert.match(client, /request[\s\S]*JSON\.stringify\(\{ device_id: deviceId, request_id: requestId \}\)/)
  assert.match(client, /status\?device_id=\$\{encodeURIComponent\(deviceId\)\}/)
})

test('explicit Update saves before requesting and locks duplicate clicks', () => {
  const flow = home.slice(home.indexOf('async function handleExplicitUpdate'), home.indexOf('async function logout'))
  assert.ok(flow.indexOf('persistSettings(deviceId)') < flow.indexOf('requestDeviceUpdate(supabase, deviceId, requestId)'))
  assert.match(flow, /if \(!saved[^)]*\)[\s\S]*return/)
  assert.match(flow, /updateActionInFlightRef\.current/)
  assert.match(home, /disabled=\{!activeDeviceId \|\| persisting \|\| manualUpdatePending \|\| layoutDraftSaving\}/)
})

test('backend acknowledgement remains diagnostic and does not control visible completion', () => {
  assert.match(client, /DEVICE_UPDATE_POLL_MS = 1_000/)
  assert.match(client, /DEVICE_UPDATE_TIMEOUT_MS = 3 \* 60_000/)
  assert.match(client, /return displayedRevision >= requestedRevision/)
  assert.match(home, /requestedRevision = await requestDeviceUpdate/)
  assert.match(home, /revisionHasBeenDisplayed\(updateStatus\.displayedRevision, operation\.requestedRevision\)/)
  assert.match(home, /revisionHasBeenDisplayed/)
  assert.doesNotMatch(home, /setExplicitUpdateStatus\('updated'\)|setExplicitUpdateStatus\('unconfirmed'\)/)
})

test('frame/tab/auth changes invalidate stale Update operations', () => {
  assert.match(home, /updateOperationIdRef\.current \+= 1/)
  assert.match(home, /updateOperationRef\.current = null/)
  assert.match(home, /activeDeviceIdRef\.current !== deviceId/)
  assert.match(home, /operation\.id !== operationId/)
  assert.match(home, /\[activeDeviceId, activeTab, userId\]/)
})

test('network errors remain non-destructive until timeout', () => {
  assert.match(home, /Keep polling the exact revision through transient network failures/)
  assert.match(home, /Frame hasn’t confirmed the update yet\./)
  assert.match(home, /Settings were saved, but the update could not be started\./)
})
