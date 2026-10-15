import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { mqttEnabledForDevice } from '../app/lib/device/mqttRollout.ts'
import { deriveFrameMqttPassword, provisionFrameMqtt } from '../app/lib/device/mqttFleetProvisioning.ts'

const longSecret = 'S'.repeat(64)
const base = {
  serverUrl: 'https://broker.example:8443/api/v5/publish',
  apiKey: 'api-id', apiSecret: 'api-secret',
  derivationSecret: longSecret,
}

test('single pilot stays enabled; fleet requires separate explicit switch AND derivation secret', () => {
  const pilot = { pilotEnabled: 'true', pilotDeviceId: 'frm_54AE37455F34' }
  assert.equal(mqttEnabledForDevice('frm_54AE37455F34', pilot), true)
  assert.equal(mqttEnabledForDevice('frm_next', pilot), false)
  assert.equal(mqttEnabledForDevice('frm_next', { ...pilot, fleetEnabled: 'true' }), false)
  assert.equal(mqttEnabledForDevice('frm_next', { ...pilot, fleetEnabled: 'true', fleetSecret: 'short' }), false)
  assert.equal(mqttEnabledForDevice('frm_next', { ...pilot, fleetEnabled: 'true', fleetSecret: longSecret }), true)
  assert.equal(mqttEnabledForDevice('frm_next', { ...pilot, pilotEnabled: undefined, fleetEnabled: 'true', fleetSecret: longSecret }), false)
  assert.equal(mqttEnabledForDevice('bad/#', { ...pilot, fleetEnabled: 'true', fleetSecret: longSecret }), false)
})

test('per-frame derived credentials are stable, unique, and do not expose master key', () => {
  const one = deriveFrameMqttPassword('frm_first', longSecret)
  const again = deriveFrameMqttPassword('frm_first', longSecret)
  const two = deriveFrameMqttPassword('frm_second', longSecret)
  assert.equal(one, again)
  assert.notEqual(one, two)
  assert.ok(one.length >= 40)
  assert.ok(!one.includes(longSecret))
  assert.equal(deriveFrameMqttPassword('frm_first', 'short'), null)
  assert.equal(deriveFrameMqttPassword('x/#', longSecret), null)
})

test('fleet provisions its own broker user and exact subscribe-only ACL after authenticated request', async () => {
  const received = []
  const response = (status, obj = {}) => new Response(JSON.stringify(obj), { status })
  const request = async (url, init) => {
    const u = new URL(url)
    received.push({ path: u.pathname, method: init.method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers })
    assert.equal(u.origin, 'https://broker.example:8443')
    assert.equal(init.redirect, 'error')
    assert.equal(init.headers.Authorization, 'Basic ' + Buffer.from('api-id:api-secret').toString('base64'))
    if (init.method === 'GET' && u.pathname.includes('/authentication/')) return response(404)
    if (init.method === 'POST' && u.pathname.includes('/authentication/')) return response(201, { user_id: 'frm_future' })
    if (init.method === 'GET' && u.pathname.includes('/authorization/')) return response(404)
    if (init.method === 'POST' && u.pathname.includes('/authorization/')) return response(204)
    throw Error('Unexpected endpoint: ' + u.pathname + ' ' + init.method)
  }
  const result = await provisionFrameMqtt('frm_future', base, request)
  assert.equal(result.ok, true)
  assert.equal(result.username, 'frm_future')
  assert.equal(result.password, deriveFrameMqttPassword('frm_future', longSecret))
  assert.equal(received.length, 4)
  assert.equal(received[1].body.user_id, 'frm_future')
  assert.equal(received[1].body.is_superuser, false)
  assert.equal(received[3].body[0].username, 'frm_future')
  assert.deepEqual(received[3].body[0].rules, [{
    topic: 'remind/pilot/revisions/frm_future', action: 'subscribe', permission: 'allow',
  }])
})

test('unsupported broker APIs fail closed; never deliver a non-provisioned device password', async () => {
  let count = 0
  const request = async () => {
    count++
    return new Response('{}', { status: 404 })
  }
  const result = await provisionFrameMqtt('frm_future', base, request)
  assert.deepEqual(result, { ok: false, reason: 'broker_unsupported' })
  assert.equal(count, 2)
})

test('pre-existing MQTT superuser account is refused, never repurposed', async () => {
  const result = await provisionFrameMqtt('frm_future', base, async () =>
    new Response(JSON.stringify({ user_id: 'frm_future', is_superuser: true }), { status: 200 }))
  assert.deepEqual(result, { ok: false, reason: 'authorization' })
})

test('reject mismatched ACL and insecure broker config instead of widening access', async () => {
  assert.deepEqual(await provisionFrameMqtt('frm_future',
    { ...base, serverUrl: 'http://broker.example/api/v5/publish' }, async () => {
      throw Error('should not fetch')
    }), { ok: false, reason: 'configuration' })
  const result = await provisionFrameMqtt('frm_future', base, async (url, init) => {
    if (url.includes('/authentication/') && init.method === 'GET') {
      return new Response(JSON.stringify({ user_id: 'frm_future', is_superuser: false }), { status: 200 })
    }
    return new Response(JSON.stringify({ username: 'frm_future', rules: [
      { topic: 'remind/pilot/revisions/#', action: 'subscribe', permission: 'allow' },
    ] }), { status: 200 })
  })
  assert.deepEqual(result, { ok: false, reason: 'authorization' })
})

test('client uses universal runtime broker details; provisioning endpoint authenticates and requires pairing', () => {
  const route = readFileSync(new URL('../app/api/device/mqtt-pilot/credentials/route.ts', import.meta.url), 'utf8')
  const fw = readFileSync(new URL('../frame/src/network/MqttPushPilot.cpp', import.meta.url), 'utf8')
  assert.match(route, /authenticatePhysicalDevice\(req, deviceId\)/)
  assert.match(route, /from\('device_members'\)/)
  assert.match(route, /provisionFrameMqtt\(deviceId\)/)
  assert.match(route, /mqttEnabledForDevice\(deviceId\)/)
  assert.match(route, /private, no-store, max-age=0/)
  assert.match(fw, /doc\["broker_host"\]/)
  assert.match(fw, /doc\["broker_port"\]/)
  assert.match(fw, /g_mqtt\.setServer\(g_brokerHost\.c_str\(\), brokerPort\)/)
  assert.doesNotMatch(fw, /g_mqtt\.connect\(clientId\.c_str\(\), id\.c_str\(\), deviceToken\.c_str\(\)\)/)
})
