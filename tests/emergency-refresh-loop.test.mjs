import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ino = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')
const checkerCpp = readFileSync(new URL('../frame/src/network/UpdateChecker.cpp', import.meta.url), 'utf8')
const checkerH = readFileSync(new URL('../frame/src/network/UpdateChecker.h', import.meta.url), 'utf8')
const frameConfig = readFileSync(new URL('../frame/src/core/FrameConfig.cpp', import.meta.url), 'utf8')
const builder = readFileSync(new URL('../app/api/device/frame-config/builder.ts', import.meta.url), 'utf8')
const meta = readFileSync(new URL('../app/api/device/config-meta/route.ts', import.meta.url), 'utf8')
const status = readFileSync(new URL('../app/api/device/status/route.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260715120000_gate_ai_assistant_refresh_by_capability.sql', import.meta.url), 'utf8')

test('failed config revision is suppressed without initializing e-paper and reaches sleep', () => {
  assert.match(checkerH, /saveFailed\(const String& updatedAt\)/)
  assert.match(checkerCpp, /prefs\.putString\("fail_upd", updatedAt\)/)
  assert.match(checkerCpp, /isFailedRevisionSuppressed\(outUpdatedAt\)/)
  const failBlock = ino.slice(ino.indexOf('FrameConfigApi::FetchResult retryResult'), ino.indexOf('ModuleDate::setConfig'))
  assert.match(failBlock, /UpdateChecker::saveFailed\(updatedAt\)/)
  assert.match(failBlock, /postDeviceStatus\(batt, pwr, false\)/)
  assert.match(failBlock, /sleep_reached=true/)
  assert.doesNotMatch(failBlock, /ensureDisplay\(\)|showError|drawWithContent/)
  assert.match(ino, /g_cfg\.assignCount == 0 && configChanged/)
  assert.match(ino, /render_blocked=empty_firmware_payload/)
})

test('successful render acknowledges compatible revision exactly once', () => {
  assert.equal((ino.match(/UpdateChecker::saveApplied\(updatedAt\)/g) || []).length, 1)
  assert.match(ino, /revision_acknowledged=/)
  assert.match(status, /if \(did_render === true\)[\s\S]*payload\.last_render_at = nowIso/)
})

test('diagnostics cover the emergency loop path without private content', () => {
  for (const pattern of [/wake_reason=/, /remote_config_revision=/, /local_applied_revision=/, /shouldRender=true reason=/, /frame_config_http_status=/, /frame_config_response_bytes=/, /frame_config_json_parse=/, /assignment_count=/, /render_started=true/, /render_completed=true/, /revision_acknowledged=/, /sleep_reached=true/]) {
    assert.match(ino + checkerCpp + frameConfig, pattern)
  }
})

test('firmware revision uses stable filtered physical payload and omits unsupported Assistant cells', () => {
  assert.match(builder, /compatibleRevisionForPayload/)
  assert.match(builder, /crypto\.createHash\('sha256'\)/)
  assert.match(meta, /buildFrameConfigPayload\(supabase, device_id\)/)
  assert.match(builder, /rawCells\.filter/)
  assert.doesNotMatch(builder, /module: ''/)
  assert.match(builder, /options\.target === 'mirror' \? rawCells : physicalCells/)
})

test('Assistant refresh RPC is gated by explicit firmware capability', () => {
  assert.match(migration, /assistant_module_v1/)
  assert.match(migration, /current_version/)
  assert.match(migration, /requested', false[\s\S]*requires_capability', 'assistant_module_v1'/)
})

test('no new wake interval or polling timer is introduced', () => {
  assert.equal((ino.match(/QUICK_WAKE_US/g) || []).length, 2)
  assert.doesNotMatch(builder + meta + migration, /setInterval|setTimeout|cron|schedule/i)
})
