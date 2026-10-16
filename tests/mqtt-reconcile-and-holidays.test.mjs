import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getFrameHolidayList } from '../app/lib/device/frameHolidayCache.mjs'

function fakeResponse(holidays) {
  return { ok: true, json: async () => ({ holidays }) }
}

test('holiday fetches for two years begin concurrently and validate data', async () => {
  const requested = []
  const resolvers = new Map()
  const request = async (url) => new Promise((resolve) => {
    requested.push(url)
    resolvers.set(Number(new URL(url).searchParams.get('year')), resolve)
  })
  const pending = getFrameHolidayList({
    base: 'https://holiday-parallel.example', country: 'NO',
    years: [2026, 2027], request,
  })
  assert.equal(requested.length, 2, 'both requests must begin before either returns')
  resolvers.get(2027)(fakeResponse([{ date: '2027-01-01', name: 'New Year' }]))
  resolvers.get(2026)(fakeResponse([
    { date: '2026-12-25', name: 'Christmas' },
    { date: 'invalid', name: 'Invalid' },
  ]))
  assert.deepEqual(await pending, [
    { date: '2026-12-25', name: 'Christmas' },
    { date: '2027-01-01', name: 'New Year' },
  ])
})

test('concurrent frames coalesce the same national holiday request and reuse warm cache', async () => {
  let requests = 0
  let clock = 1000000
  const request = async () => {
    requests++
    return fakeResponse([{ date: '2026-12-25', name: 'Christmas' }])
  }
  const options = { base: 'https://holiday-coalesce.example', country: 'NO',
    years: [2026, 2027], request, now: () => clock }
  const [first, second] = await Promise.all([
    getFrameHolidayList(options), getFrameHolidayList(options),
  ])
  assert.equal(requests, 2)
  assert.deepEqual(first, second)
  clock += 30 * 60 * 1000
  await getFrameHolidayList(options)
  assert.equal(requests, 2)
  clock += 7 * 60 * 60 * 1000
  await getFrameHolidayList(options)
  assert.equal(requests, 4)
})

test('holiday failure is bounded and does not poison cache for six hours', async () => {
  let clock = 1000
  let requests = 0
  const request = async (_url, { signal }) => {
    requests++
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
    })
  }
  const options = { base: 'https://holiday-timeout.example', country: 'NO',
    years: [2026, 2027], request, now: () => clock, timeoutMs: 10 }
  assert.equal(await getFrameHolidayList(options), null)
  assert.equal(requests, 2)
  assert.equal(await getFrameHolidayList(options), null)
  assert.equal(requests, 2)
  clock += 61000
  assert.equal(await getFrameHolidayList(options), null)
  assert.equal(requests, 4)
})

test('MQTT subscribe requires one authenticated resync plus bounded safety fallback', () => {
  const firmware = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')
  const mqtt = readFileSync(new URL('../frame/src/network/MqttPushPilot.cpp', import.meta.url), 'utf8')
  const ack = readFileSync(new URL('../frame/src/network/LiveUpdate.cpp', import.meta.url), 'utf8')
  const backend = readFileSync(new URL('../app/api/device/update-state/route.ts', import.meta.url), 'utf8')
  assert.match(firmware, /static const char\* FW_VER = "v2\.7\.2";/)
  assert.match(firmware, /MQTT_MISSED_HINT_RECOVERY_MS = 120000UL/)
  assert.match(firmware, /MANUAL_UPDATE_POLL_MS = 10000/)
  assert.match(mqtt, /if \(subscribed\) \{[\s\S]*?g_subscriptionResyncPending = true/)
  assert.match(firmware, /MqttPushPilot::takeSubscriptionResync\(\)/)
  assert.match(firmware, /pushHint \|\| subscriptionResync/)
  assert.match(firmware, /MqttPushPilot::restoreSubscriptionResync\(\)/)
  assert.match(firmware, /g_manualTiming.mqttSubscriptionResync = g_mqttResyncVerifiedRevision == revision/)
  assert.match(ack, /mqtt_subscription_resync/)
  assert.match(backend, /mqtt_subscription_resync/)
})
