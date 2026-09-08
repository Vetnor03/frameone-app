// TEMP_REFRESH_AUDIT: temporary behavioural tests; remove with the feature.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TEMP_REFRESH_AUDIT_classify,
  TEMP_REFRESH_AUDIT_prepareBatch,
  TEMP_REFRESH_AUDIT_sanitize,
} from '../app/lib/device/tempRefreshAudit.mjs'

const base = (overrides = {}) => ({
  event_seq: 41, occurred_at: 1788883200, trigger: 'surf_source_changed',
  refresh_type: 'none', render_changed: false, physical_refresh: false,
  backend_revision_before: 10, backend_revision_after: 11,
  raw_changes: { swell_height: { before: 0.94, after: 1.02 } },
  display_changes: { swell_height: { before: '1.0 m', after: '1.0 m' } },
  metadata: {}, ...overrides,
})

test('TEMP_REFRESH_AUDIT classifies actual filtered, useful, wasted, and intentional values', () => {
  assert.equal(TEMP_REFRESH_AUDIT_classify(base()), 'filtered_change')
  assert.equal(TEMP_REFRESH_AUDIT_classify(base({ physical_refresh: true, render_changed: true })), 'useful_redraw')
  assert.equal(TEMP_REFRESH_AUDIT_classify(base({ physical_refresh: true, render_changed: false })), 'wasted_redraw')
  assert.equal(TEMP_REFRESH_AUDIT_classify(base({ physical_refresh: true, render_changed: null, metadata: { intentional_refresh: true } })), 'intentional_refresh')
})

test('TEMP_REFRESH_AUDIT sanitizer preserves facts and converts trustworthy device event time', () => {
  const record = TEMP_REFRESH_AUDIT_sanitize(base())
  assert.equal(record.event_seq, 41)
  assert.equal(record.occurred_at, '2026-09-08T16:00:00.000Z')
  assert.deepEqual(record.raw_changes.swell_height, { before: 0.94, after: 1.02 })
  assert.equal(record.decision, 'filtered_change')
  assert.equal(TEMP_REFRESH_AUDIT_sanitize(base({ occurred_at: 12 })), null)
  assert.equal(TEMP_REFRESH_AUDIT_sanitize(base({ occurred_at: null })).occurred_at, null)
})

test('TEMP_REFRESH_AUDIT duplicate sequence ingestion is idempotently deduplicated', () => {
  const duplicate = base({ trigger: 'resent_copy' })
  const batch = TEMP_REFRESH_AUDIT_prepareBatch([base(), duplicate], true)
  assert.equal(batch.error, null)
  assert.equal(batch.records.length, 1)
  assert.equal(batch.records[0].trigger, 'resent_copy')
  const route = readFileSync('app/api/device/refresh-audit/route.ts', 'utf8')
  assert.match(route, /\.upsert\([\s\S]*onConflict: 'device_id,event_seq'[\s\S]*ignoreDuplicates: true/)
})

test('TEMP_REFRESH_AUDIT disabled and bounded batch validation return actual errors', () => {
  assert.equal(TEMP_REFRESH_AUDIT_prepareBatch([base()], false).error, 'disabled')
  assert.equal(TEMP_REFRESH_AUDIT_prepareBatch([], true).error, 'invalid_batch')
  assert.equal(TEMP_REFRESH_AUDIT_prepareBatch(Array.from({ length: 9 }, (_, i) => base({ event_seq: i + 1 })), true).error, 'invalid_batch')
  assert.equal(TEMP_REFRESH_AUDIT_prepareBatch([base({ event_seq: 0 })], true).error, 'invalid_record')
})

test('TEMP_REFRESH_AUDIT firmware batching and operational refresh guards remain explicit', () => {
  const audit = readFileSync('frame/src/core/TempRefreshAudit.cpp', 'utf8')
  const main = readFileSync('frame/src/frame_v2.5.1.ino', 'utf8')
  const net = readFileSync('frame/src/network/NetClient.cpp', 'utf8')
  assert.match(audit, /TEMP_REFRESH_AUDIT_BATTERY_BATCH_THRESHOLD = 4/)
  assert.match(audit, /count < TEMP_REFRESH_AUDIT_BATTERY_BATCH_THRESHOLD/)
  assert.match(main, /"charger_connected"[\s\S]*"charger_disconnected"/)
  assert.match(main, /"firmware_maintenance"/)
  const method = net.slice(net.indexOf('bool NetClient::TEMP_REFRESH_AUDIT_httpPostConnected'))
  assert.match(method, /WiFi\.status\(\) != WL_CONNECTED/)
  assert.doesNotMatch(method, /recoverWifiTransport|connectSaved|doRequestWithRetry/)
})
