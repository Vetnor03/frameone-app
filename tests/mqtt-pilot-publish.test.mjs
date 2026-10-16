import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { pilotRevisionTopic, publishPilotRevision } from '../app/lib/device/mqttPilotPublish.ts'

const route = readFileSync(new URL('../app/api/device/update-state/request/route.ts', import.meta.url), 'utf8')

test('MQTT publisher is disabled without explicit opt-in and makes no requests', async () => {
  let calls = 0
  const result = await publishPilotRevision('frm_54AE37455F34', 42, {
    enabled: undefined, pilotDeviceId: 'frm_54AE37455F34', publishUrl: 'https://broker.example/api/v5/publish',
    apiKey: 'key', apiSecret: 'secret',
  }, async () => { calls++; throw new Error('unexpected') })
  assert.equal(result, 'disabled')
  assert.equal(calls, 0)
})

test('pilot notifications contain only an exact device topic and durable revision', async () => {
  let seen
  const config = {
    enabled: 'true', pilotDeviceId: 'frm_54AE37455F34', publishUrl: 'https://broker.example/api/v5/publish',
    apiKey: 'test-key', apiSecret: 'test-secret'
  }
  const result = await publishPilotRevision('frm_54AE37455F34', 42, config, async (url, init) => {
    seen = { url, init }
    return { status: 200, ok: true }
  })
  assert.equal(result, 'published')
  assert.equal(seen.url, 'https://broker.example/api/v5/publish')
  assert.equal(seen.init.method, 'POST')
  assert.equal(seen.init.redirect, 'error')
  assert.equal(seen.init.headers.authorization, 'Basic ' + Buffer.from('test-key:test-secret').toString('base64'))
  assert.deepEqual(JSON.parse(seen.init.body), {
    topic: 'remind/pilot/revisions/frm_54AE37455F34',
    qos: 1,
    retain: false,
    payload: '42',
    payload_encoding: 'plain',
  })
  assert.equal(pilotRevisionTopic('frame/other'), null)
  assert.equal(pilotRevisionTopic('frame+#'), null)
  assert.equal(pilotRevisionTopic('frm_54AE37455F34'), 'remind/pilot/revisions/frm_54AE37455F34')
})

test('offline MQTT never blocks a successful HTTP update request', async () => {
  const config = { enabled: 'true', pilotDeviceId: 'frame-1', publishUrl: 'https://broker.example/publish', apiKey: 'key', apiSecret: 'secret' }
  assert.equal(await publishPilotRevision('frame-1', 1, config, async () => {
    throw new Error('broker offline')
  }), 'failed')
  assert.equal(await publishPilotRevision('frame-1', 1, config, async () => ({ status: 202, ok: true })), 'no_subscribers')
  assert.match(route, /rpc\('request_device_display_revision'/)
  assert.match(route, /if \(error\) return NextResponse\.json\(\{ error: 'internal_error' \}/)
  assert.match(route, /await publishPilotRevision\(deviceId, Number\(data\)\)/)
  assert.match(route, /return NextResponse\.json\(\{ requested_revision: data \}\)/)
})

test('publisher fails closed on unsafe endpoints, invalid topics, revisions or config', async () => {
  const conf = { enabled: 'true', pilotDeviceId: 'frame-1', publishUrl: 'http://broker.example/api/v5/publish', apiKey: 'key', apiSecret: 'secret' }
  const forbid = async () => { throw Error('Should not send') }
  assert.equal(await publishPilotRevision('frame-1', 1, conf, forbid), 'failed')
  assert.equal(await publishPilotRevision('frame-1', 1, { ...conf, publishUrl: 'https://evil.example/redirect' }, forbid), 'failed')
  assert.equal(await publishPilotRevision('frame/2', 1, { ...conf, publishUrl: 'https://broker.example/publish' }, forbid), 'disabled')
  assert.equal(await publishPilotRevision('frame-1', -1, { ...conf, publishUrl: 'https://broker.example/publish' }, forbid), 'failed')
  assert.equal(await publishPilotRevision('frame-1', 1, { ...conf, publishUrl: 'https://broker.example/publish', apiSecret: '' }, forbid), 'failed')
})


test('fleet publisher uses the Dedicated provisioning API and credentials, never pilot Serverless', async () => {
  let called
  const config = {
    enabled: 'true', pilotDeviceId: 'frm_54AE37455F34',
    fleetEnabled: 'true', fleetSecret: 'S'.repeat(64),
    fleetProvider: 'emqx_dedicated_v5', fleetManagementUrl: 'https://dedicated.example:8443/api/v5',
    fleetBrokerHost: 'dedicated-mqtt.example', fleetBrokerPort: '8883',
    fleetApiKey: 'dedicated-key', fleetApiSecret: 'dedicated-secret',
    publishUrl: 'https://serverless.example:8443/api/v5/publish',
    apiKey: 'pilot-key', apiSecret: 'pilot-secret',
  }
  const response = await publishPilotRevision('frm_future', 15, config, async (url, init) => {
    called = { url, init }
    return { status: 200, ok: true }
  })
  assert.equal(response, 'published')
  assert.equal(called.url, 'https://dedicated.example:8443/api/v5/publish')
  assert.equal(called.init.headers.authorization,
    'Basic ' + Buffer.from('dedicated-key:dedicated-secret').toString('base64'))
  assert.equal(JSON.parse(called.init.body).topic, 'remind/pilot/revisions/frm_future')

  const pilot = await publishPilotRevision('frm_54AE37455F34', 15, config, async (url, init) => {
    called = { url, init }
    return { status: 200, ok: true }
  })
  assert.equal(pilot, 'published')
  assert.equal(called.url, config.publishUrl)
  assert.equal(called.init.headers.authorization,
    'Basic ' + Buffer.from('pilot-key:pilot-secret').toString('base64'))

  const fleetWithoutPilot = await publishPilotRevision('frm_future', 15,
    { ...config, enabled: 'false' }, async (url) => {
      called = { url }
      return { status: 200, ok: true }
    })
  assert.equal(fleetWithoutPilot, 'published')
  assert.equal(called.url, 'https://dedicated.example:8443/api/v5/publish')
})
