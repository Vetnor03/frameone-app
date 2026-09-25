import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const firmware = read('frame/src/frame_v2.5.1.ino')
const liveHeader = read('frame/src/network/LiveUpdate.h')
const liveClient = read('frame/src/network/LiveUpdate.cpp')
const ackRoute = read('app/api/device/update-state/route.ts')
const renderRoute = read('app/api/device/render-state/route.ts')

test('manual phase timings travel on the existing ACK without another HTTP call', () => {
  assert.match(liveHeader, /struct ManualUpdateTimings/)
  assert.match(liveHeader, /const ManualUpdateTimings\* timings = nullptr/)
  assert.match(liveClient, /manual_timing/)
  assert.match(liveClient, /timings && timings->ready/)
  assert.match(liveClient, /httpPostAuthJson\(\s*String\(BASE_URL\) \+ "\/api\/device\/update-state"/)
  assert.doesNotMatch(liveClient, /\/api\/device\/update-timing/)
  assert.match(firmware, /rendered == explicitTimingRevision && g_manualTiming\.ready/)
  assert.match(firmware, /reportManualTiming \? &g_manualTiming : nullptr/)
})

test('manual timing is reported only after real render and cleared on successful ACK', () => {
  assert.match(firmware, /g_captureManualRenderTimings = true;[\s\S]*renderSmartDashboard[\s\S]*g_captureManualRenderTimings = false/)
  assert.match(firmware, /g_manualTiming\.ready = true;/)
  assert.match(firmware, /g_manualTiming\.ready = false;/)
  assert.match(firmware, /g_manualTiming\.attempts = \+\+g_manualTimingAttempts/)
  for (const stage of [
    'probeToPendingMs', 'updatingScreenMs', 'configFetchMs',
    'renderStateFetchMs', 'remindersPreloadMs', 'newsPreloadMs',
    'soccerPreloadMs', 'displayMs', 'renderTotalMs', 'postRenderMs', 'beforeAckMs',
  ]) assert.match(firmware, new RegExp('g_manualTiming\\.' + stage))
})

test('diagnostics cannot change the ACK response or device authorization', () => {
  assert.match(ackRoute, /authenticatePhysicalDevice\(req, deviceId\)/)
  assert.match(ackRoute, /rpc\('ack_device_display_revision'/)
  assert.match(ackRoute, /if \(error\) return NextResponse\.json\(\{ error: 'internal_error' \}, \{ status: 500 \}\)[\s\S]*manual_timing/)
  assert.match(ackRoute, /typeof value === 'number' && Number\.isSafeInteger\(value\)/)
  assert.match(ackRoute, /console\.info\('\[device\/update-state\] manual-timing'/)
  assert.match(ackRoute, /return NextResponse\.json\(\{ displayed_revision: data \}\)/)
  assert.doesNotMatch(ackRoute, /\.from\('product_analytics_events'\)|\.from\('temp_refresh_audit_logs'\)/)
})

test('render-state logs source, config, manifest stages but preserves response contract', () => {
  for (const name of ['auth_ms', 'config_ms', 'sources_ms', 'manifest_ms', 'total_ms']) {
    assert.match(renderRoute, new RegExp(name + ':'))
  }
  assert.match(renderRoute, /return NextResponse\.json\(\{ layout_hash: layoutHash, modules \}/)
  assert.match(renderRoute, /'Cache-Control': 'private, no-store, max-age=0'/)
})
