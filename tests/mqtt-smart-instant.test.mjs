import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { publishPilotActivity } from '../app/lib/device/mqttPilotPublish.ts'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const route = read('../app/api/device/mqtt-pilot/activity/route.ts')
const app = read('../app/HomePageClient.tsx')

test('broker activity hint is minimal, non-retained, scoped to pilot topic, and contains no secrets', async () => {
  let sent
  const result = await publishPilotActivity('frm_54AE37455F34', {
    enabled: 'true', pilotDeviceId: 'frm_54AE37455F34',
    publishUrl: 'https://broker.example/api/v5/publish',
    apiKey: 'fake-id', apiSecret: 'fake-secret',
  }, async (_url, init) => {
    sent = JSON.parse(init.body)
    return { status: 200, ok: true }
  })
  assert.equal(result, 'published')
  assert.equal(sent.topic, 'remind/pilot/revisions/frm_54AE37455F34')
  assert.equal(sent.payload, 'active:120')
  assert.equal(sent.retain, false)
  assert.equal(sent.qos, 1)
  assert.ok(!JSON.stringify(sent).includes('fake-secret'))
})

test('activity publishing does nothing for other customers and when experiment disabled', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; throw Error('must not fetch') }
  const config = { enabled: 'true', pilotDeviceId: 'frm_54AE37455F34',
    publishUrl: 'https://broker.example/api/v5/publish', apiKey: 'test', apiSecret: 'test' }
  assert.equal(await publishPilotActivity('frm_other', config, fetchImpl), 'disabled')
  assert.equal(await publishPilotActivity('frm_54AE37455F34', { ...config, enabled: undefined }, fetchImpl), 'disabled')
  assert.equal(calls, 0)
})

test('app activity requests require membership and a single allowlisted frame', () => {
  assert.match(route, /if \(!mqttEnabledForDevice\(deviceId\)\)/)
  assert.match(route, /authenticateUserForDevice\(req, deviceId\)/)
  assert.match(route, /publishPilotActivity\(deviceId\)/)
  assert.doesNotMatch(route, /request_device_display_revision/)
  assert.match(route, /Cache-Control': 'no-store'/)
})

test('foreground app sends throttle-limited hints and stops on invisibility/inactivity/Power Save', () => {
  assert.doesNotMatch(app, /MQTT_SMART_INSTANT_PILOT_DEVICE_ID/)
  assert.match(app, /if \(!userId \|\| !activeDeviceId \|\| powerSaver\) return/)
  assert.match(app, /document\.visibilityState !== 'visible'/)
  assert.match(app, /Date\.now\(\) - lastInteractionAt > 90_000/)
  assert.match(app, /Date\.now\(\) - lastSentAt < 50_000/)
  assert.match(app, /window\.setInterval\(\(\) => \{ void signalActivity\(\) \}, 45_000\)/)
  assert.match(app, /removeEventListener\('visibilitychange', onVisibility\)/)
  assert.match(app, /removeEventListener\('pointerdown', noteInteraction\)/)
  assert.match(app, /if \(result\.enabled === false\) disabledOnServer = true/)
})
