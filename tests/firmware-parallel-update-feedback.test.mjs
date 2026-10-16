import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const firmware = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')
const timings = readFileSync(new URL('../frame/src/network/LiveUpdate.h', import.meta.url), 'utf8')
const transport = readFileSync(new URL('../frame/src/network/LiveUpdate.cpp', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/device/update-state/route.ts', import.meta.url), 'utf8')

test('standard firmware starts isolated HTTPS fetch before physical Updating feedback', () => {
  const start = firmware.indexOf('static bool fetchAndRenderExplicit(')
  const end = firmware.indexOf('static bool refreshContentSignatureBestEffort', start)
  assert.ok(start > 0 && end > start)
  const manual = firmware.slice(start, end)
  assert.ok(manual.indexOf('xTaskCreatePinnedToCore(') < manual.indexOf('DisplayCore::drawUpdatingScreen()'))
  assert.ok(manual.indexOf('DisplayCore::drawUpdatingScreen()') < manual.indexOf('ulTaskNotifyTake(pdTRUE, portMAX_DELAY)'))
  assert.ok(manual.indexOf('ulTaskNotifyTake(pdTRUE, portMAX_DELAY)') < manual.indexOf('g_cfg = prefetch->stagedConfig'))
  assert.ok(manual.indexOf('g_cfg = prefetch->stagedConfig') < manual.indexOf('renderSmartDashboard('))
  assert.match(firmware, /manualUpdatePrefetchTask\(void\* arg\)/)
  assert.match(firmware, /FrameConfigApi::fetchWithStatus\(job->stagedConfig, job->token\)/)
  assert.match(firmware, /SmartRefresh::fetchRenderState\(job->token, "all", job->desired\)/)
  assert.match(firmware, /xTaskNotifyGive\(job->waiter\)/)
  assert.match(manual, /if \(!parallelFetch\)/)
  assert.match(manual, /result = FrameConfigApi::fetchWithStatus\(g_cfg, DeviceIdentity::getToken\(\)\)/)
  assert.match(manual, /if \(!renderStateOk\) return false/)
})

test('MQTT receipt is linked to the HTTPS verified revision rather than broker publish', () => {
  assert.match(firmware, /if \(pushHint && next.requestedRevision > next.displayedRevision\)/)
  assert.match(firmware, /g_mqttHintVerifiedRevision = next.requestedRevision/)
  assert.match(firmware, /g_manualTiming.mqttHintReceived = g_mqttHintVerifiedRevision == revision/)
  assert.match(firmware, /g_manualTiming.mqttSubscribed = MqttPushPilot::connected\(\) \? 1 : 0/)
})

test('numeric-only transport and parallel fetch timings piggyback on existing ACK', () => {
  for (const [field,member] of [
    ['mqtt_subscribed','mqttSubscribed'],
    ['mqtt_hint_received','mqttHintReceived'],
    ['parallel_fetch','parallelFetch'],
    ['fetch_wait_ms','fetchWaitMs'],
  ]) {
    assert.match(timings, new RegExp('uint32_t ' + member + ' = 0'))
    assert.ok(transport.includes(field))
    assert.ok(transport.includes('timings->' + member))
    assert.ok(route.includes("'" + field + "'"))
  }
  assert.match(transport, /LiveUpdate::acknowledge/)
  assert.match(route, /Number\.isSafeInteger\(value\)/)
  assert.match(route, /value <= 3_600_000/)
})
