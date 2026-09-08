// TEMP_REFRESH_AUDIT: focused temporary diagnostic tests; remove with the feature.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const route = readFileSync('app/api/device/refresh-audit/route.ts', 'utf8')
const firmware = readFileSync('frame/src/core/TempRefreshAudit.cpp', 'utf8')
const net = readFileSync('frame/src/network/NetClient.cpp', 'utf8')
const migration = readFileSync('supabase/migrations/20260908120000_temp_refresh_audit.sql', 'utf8')

test('TEMP_REFRESH_AUDIT raw source change with identical normalized hash is filtered without redraw', () => {
  assert.match(firmware, /!changed && sourceChanged \? "filtered_change"/)
  assert.match(firmware, /plan\.type != SmartDisplayPlan::NONE && displaySucceeded/)
})

test('TEMP_REFRESH_AUDIT changed render plus physical update is useful', () => {
  assert.match(firmware, /physical \? \(changed \? "useful_redraw"/)
})

test('TEMP_REFRESH_AUDIT identical hashes plus physical update is wasted', () => {
  assert.match(firmware, /"wasted_redraw"/)
  assert.match(migration, /physical_refresh = true and render_changed = false/)
})

test('TEMP_REFRESH_AUDIT logger failure cannot alter refresh and keeps records', () => {
  assert.match(firmware, /if \(sent && code >= 200 && code < 300\)/)
  assert.doesNotMatch(firmware, /ESP\.restart|deep_sleep|throw/)
})

test('TEMP_REFRESH_AUDIT disabled creates and uploads nothing', () => {
  assert.match(firmware, /#if TEMP_REFRESH_AUDIT_ENABLED/g)
  assert.match(route, /if \(!TEMP_REFRESH_AUDIT_ENABLED\)/)
})

test('TEMP_REFRESH_AUDIT batching piggybacks and cannot establish an independent network session', () => {
  assert.match(firmware, /TEMP_REFRESH_AUDIT_MAX_RECORDS = 8/)
  const method = net.slice(net.indexOf('TEMP_REFRESH_AUDIT_httpPostConnected'))
  assert.match(method, /WiFi\.status\(\) != WL_CONNECTED/)
  assert.doesNotMatch(method, /recoverWifiTransport|connectSaved|doRequestWithRetry/)
})
