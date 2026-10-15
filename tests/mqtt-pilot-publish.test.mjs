import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { pilotRevisionTopic, publishPilotRevision } from '../app/lib/device/mqttPilotPublish.ts'

const route = readFileSync(new URL('../app/api/device/update-state/request/route.ts', import.meta.url), 'utf8')

test('MQTT publisher is disabled without explicit opt-in and makes no requests', async () => {
  let calls = 0
  const result = await publishPilotRevision('frm_54AE37455F34', 42, {
    enabled: undefined, publishUrl: 'https://broker.example/api/v5/publish',
    apiKey: 'key', apiSecret: 'secret',
  }, async () => { calls++; throw new Error('unexpected') })
  assert.equal(result, 'disabled')
  assert.equal(calls, 0)
})

test('pilot notifications contain only an exact device topic and durable revision', async () => {
  let seen
  const config = {
    enabled: 'true', publishUrl: 'https://broker.example/api/v5/publish',
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
  const config = { enabled: 'true', publishUrl: 'https://broker.example/publish', apiKey: 'key', apiSecret: 'secret' }
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
  const conf = { enabled: 'true', publishUrl: 'http://broker.example/api/v5/publish', apiKey: 'key', apiSecret: 'secret' }
  const forbid = async () => { throw Error('Should not send') }
  assert.equal(await publishPilotRevision('frame-1', 1, conf, forbid), 'failed')
  assert.equal(await publishPilotRevision('frame-1', 1, { ...conf, publishUrl: 'https://evil.example/redirect' }, forbid), 'failed')
  assert.equal(await publishPilotRevision('frame/2', 1, { ...conf, publishUrl: 'https://broker.example/publish' }, forbid), 'failed')
  assert.equal(await publishPilotRevision('frame-1', -1, { ...conf, publishUrl: 'https://broker.example/publish' }, forbid), 'failed')
  assert.equal(await publishPilotRevision('frame-1', 1, { ...conf, publishUrl: 'https://broker.example/publish', apiSecret: '' }, forbid), 'failed')
})
