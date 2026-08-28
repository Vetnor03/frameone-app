import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../app/lib/device/updateStateClient.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const saveRoute = readFileSync(new URL('../app/api/device/save-settings/route.ts', import.meta.url), 'utf8')
const disabledLogic = home.slice(home.indexOf('const actionDisabled'), home.indexOf('const updateStatusText'))

test('active frame editing surfaces heartbeat every 45 seconds and pause while hidden', () => {
  assert.match(client, /DEVICE_ACTIVITY_HEARTBEAT_MS = 45_000/)
  assert.match(home, /activeTab === 'settings'/)
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

test('explicit Update reuses the revision published by settings save', () => {
  const flow = home.slice(home.indexOf('function handleExplicitUpdate'), home.indexOf('async function logout'))
  assert.match(flow, /requestedRevision \?\?= await persistSettings\(deviceId\)/)
  assert.doesNotMatch(flow, /requestManualUpdateRevision|requestDeviceUpdate/)
  assert.match(flow, /requestId: `desired-\$\{requestedRevision\}`/)
  assert.match(flow, /updateActionInFlightRef\.current/)
  assert.match(home, /const actionDisabled = layoutFlow[\s\S]*: !activeDeviceId/)
  assert.doesNotMatch(disabledLogic, /persisting|manualUpdatePending|manualUpdateInProgress/)
  assert.match(home, /disabled=\{actionDisabled\}/)
})

test('one settings change publishes exactly one display revision', () => {
  assert.equal(saveRoute.match(/\.rpc\('request_device_display_revision'/g)?.length, 1)
  assert.match(saveRoute, /saved_settings_json:[\s\S]*requested_revision: revision\.data/)
})

test('manual Update reuses a pending newest revision instead of rendering identical state twice', () => {
  const flow = home.slice(home.indexOf('async function runExplicitUpdate'), home.indexOf('async function logout'))
  assert.match(flow, /status\.requestedRevision > status\.displayedRevision/)
  assert.match(flow, /requestedRevision = status\.requestedRevision/)
  assert.match(flow, /requestedRevision \?\?= await persistSettings\(deviceId\)/)
})

test('repeated Update presses join the active operation and never silently hit an in-flight guard', () => {
  const handler = home.slice(home.indexOf('function handleExplicitUpdate'), home.indexOf('async function runExplicitUpdate'))
  assert.match(handler, /manualUpdateCompletionRef\.current/)
  assert.match(handler, /void existing\.promise/)
  assert.doesNotMatch(handler, /updateActionInFlightRef\.current\) return/)
})

test('layout saves are independent from pending frame updates and settings persistence', () => {
  assert.match(disabledLogic, /layoutFlow[\s\S]*layoutDraftSaving/)
  assert.doesNotMatch(disabledLogic.slice(disabledLogic.indexOf('?'), disabledLogic.indexOf(':')), /persisting|manualUpdatePending/)
  assert.doesNotMatch(disabledLogic.slice(disabledLogic.indexOf(':')), /persisting|manualUpdatePending/)
})

test('live edits debounce briefly, persist immediately, and request a newest-state revision', () => {
  assert.match(client, /LIVE_UPDATE_SAVE_DEBOUNCE_MS = 250/)
  assert.match(home, /activeTab === 'settings' \|\| !dirty \|\| persisting/)
  assert.match(home, /await persistSettings\(deviceId\)/)
  assert.match(saveRoute, /request_device_display_revision/)
  assert.match(saveRoute, /requested_revision: revision\.data/)
  assert.match(home, /requested: Math\.max\(current\.requested, requestedRevision\)/)
})

test('a change arriving during persistence remains dirty for the next latest-state pass', () => {
  assert.match(home, /desiredStateRef\.current = serialized/)
  assert.match(home, /setDirty\(desiredStateRef\.current !== persistedSignature\)/)
  assert.match(home, /newer edit may have landed while this request was in flight/)
  assert.match(home, /settingsSaveCompletionRef\.current/)
})

test('simple status derives pending from desired and confirmed revisions without locking edits', () => {
  assert.match(home, /updateRevisions\.requested > updateRevisions\.displayed/)
  assert.match(home, /'Changes pending'/)
  assert.match(home, /'Updating…'/)
  assert.match(home, /setInterval\(\(\) => void refresh\(\), DEVICE_UPDATE_POLL_MS\)/)
})

test('creating a layout without an active device is disabled and reports the prerequisite', () => {
  assert.match(disabledLogic, /layoutFlow\.mode === 'create' && !activeDeviceId/)
  assert.match(home, /if\(!activeDeviceId\)throw new Error\('Select a frame before creating a layout\.'\)/)
})

test('editing a layout without an active device stays enabled and can PATCH', () => {
  const layoutDisabledBranch = disabledLogic.slice(disabledLogic.indexOf('?'), disabledLogic.indexOf(':'))
  const saveFlow = home.slice(home.indexOf('async function saveCustomLayout'), home.indexOf('async function deleteCustom'))
  assert.doesNotMatch(layoutDisabledBranch, /^\?\s*!activeDeviceId/)
  assert.match(saveFlow, /if\(layoutFlow\?\.mode==='edit'\)[\s\S]*method:'PATCH'/)
  assert.ok(saveFlow.indexOf("method:'PATCH'") < saveFlow.indexOf('if(!activeDeviceId)'))
})

test('layoutDraftSaving disables both create and edit layout saves', () => {
  assert.match(disabledLogic, /\? layoutDraftSaving \|\| \(layoutFlow\.mode === 'create' && !activeDeviceId\)/)
})

test('backend acknowledgement remains diagnostic and does not control visible completion', () => {
  assert.match(client, /DEVICE_UPDATE_POLL_MS = 1_000/)
  assert.match(client, /DEVICE_UPDATE_TIMEOUT_MS = 3 \* 60_000/)
  assert.match(client, /return displayedRevision >= requestedRevision/)
  assert.match(home, /updateOperationRef\.current = \{ id: operationId, deviceId, requestedRevision \}/)
  assert.match(home, /requestId: `desired-\$\{requestedRevision\}`/)
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
