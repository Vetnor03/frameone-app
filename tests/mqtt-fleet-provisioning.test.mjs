import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { mqttEnabledForDevice } from '../app/lib/device/mqttRollout.ts'
import {
  deriveFrameMqttUsername, deriveFrameMqttPassword, exactDeviceRule, provisionFrameMqtt,
} from '../app/lib/device/mqttFleetProvisioning.ts'

const longSecret = 'S'.repeat(64)
const base = {
  provider: 'emqx_dedicated_v5',
  managementUrl: 'https://broker.example:8443/api/v5',
  apiKey: 'api-id', apiSecret: 'api-secret', derivationSecret: longSecret,
}
const goodUser = { user_id: 'frm_future', is_superuser: false }
const goodAcl = {
  username: 'frm_future',
  rules: [{ topic: 'remind/pilot/revisions/frm_future', action: 'subscribe', permission: 'allow' }],
}
const reply = (status, body = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status })

test('pilot remains live; fleet needs secret, explicit flag, compatible broker and management URL', () => {
  const pilot = { pilotEnabled: 'true', pilotDeviceId: 'frm_54AE37455F34' }
  assert.equal(mqttEnabledForDevice('frm_54AE37455F34', pilot), true)
  assert.equal(mqttEnabledForDevice('frm_next', pilot), false)
  const live = {
    ...pilot, fleetEnabled: 'true', fleetSecret: longSecret, fleetProvider: base.provider,
    fleetManagementUrl: base.managementUrl,
  }
  assert.equal(mqttEnabledForDevice('frm_next', { ...live, fleetEnabled: undefined }), false)
  assert.equal(mqttEnabledForDevice('frm_next', { ...live, fleetSecret: 'short' }), false)
  assert.equal(mqttEnabledForDevice('frm_next', { ...live, fleetProvider: undefined }), false)
  assert.equal(mqttEnabledForDevice('frm_next', { ...live, fleetManagementUrl: 'http://broker.example/api/v5' }), false)
  assert.equal(mqttEnabledForDevice('frm_next', live), true)
  assert.equal(mqttEnabledForDevice('frm_next', { ...live, pilotEnabled: undefined }), false)
  assert.equal(mqttEnabledForDevice('bad/#', live), false)
})

test('password differs per frame and firmware-compatible broker username is the device ID', () => {
  assert.equal(deriveFrameMqttUsername('frm_first'), 'frm_first')
  assert.equal(deriveFrameMqttUsername('bad/#'), null)
  const first = deriveFrameMqttPassword('frm_first', longSecret)
  assert.equal(first, deriveFrameMqttPassword('frm_first', longSecret))
  assert.notEqual(first, deriveFrameMqttPassword('frm_second', longSecret))
  assert.ok(first.length >= 40)
  assert.equal(deriveFrameMqttPassword('frm_first', 'short'), null)
  assert.ok(!first.includes(longSecret))
})

test('new broker user is created, confirmed, upserted with correct password and ACL is verified', async () => {
  const seen = []
  let accountCreated = false
  let aclCreated = false
  const request = async (url, init) => {
    const u = new URL(url)
    assert.equal(u.origin, 'https://broker.example:8443')
    assert.equal(init.redirect, 'error')
    assert.equal(init.headers.authorization, 'Basic ' + Buffer.from('api-id:api-secret').toString('base64'))
    const payload = init.body ? JSON.parse(init.body) : null
    seen.push({ url: u.pathname, method: init.method, payload })
    if (u.pathname.includes('/authentication/')) {
      if (init.method === 'GET') return accountCreated ? reply(200, goodUser) : reply(404)
      if (init.method === 'POST') {
        assert.equal(payload.user_id, goodUser.user_id)
        assert.equal(payload.is_superuser, false)
        accountCreated = true
        return reply(201, goodUser)
      }
      if (init.method === 'PUT') {
        assert.equal(payload.password, deriveFrameMqttPassword('frm_future', longSecret))
        assert.equal(payload.is_superuser, false)
        return reply(200, goodUser)
      }
    }
    if (u.pathname.endsWith('/authorization/sources/built_in_database/rules/all')) return reply(200, { rules: [{ topic: '#', action: 'all', permission: 'deny' }] })
    if (u.pathname.includes('/authorization/')) {
      if (init.method === 'GET') return aclCreated ? reply(200, goodAcl) : reply(404)
      if (init.method === 'POST') {
        assert.deepEqual(payload, [goodAcl])
        aclCreated = true
        return reply(204)
      }
    }
    throw Error('Unexpected request ' + u.pathname + ' ' + init.method)
  }
  const result = await provisionFrameMqtt('frm_future', base, request)
  assert.deepEqual(result, {
    ok: true, username: 'frm_future',
    password: deriveFrameMqttPassword('frm_future', longSecret),
  })
  assert.equal(seen.length, 7)
  assert.equal(seen[0].method, 'GET')
  assert.equal(seen[1].method, 'POST')
  assert.equal(seen[2].method, 'GET')
  assert.equal(seen[3].method, 'GET')
  assert.equal(seen[4].method, 'POST')
  assert.equal(seen[5].method, 'GET')
  assert.equal(seen[6].method, 'GET')
  assert.equal(seen.some(x => x.method === 'PUT'), false)
})

test('existing managed account with exact ACL is idempotently revalidated', async () => {
  const result = await provisionFrameMqtt('frm_future', base, async (url) => {
    if (url.includes('/authentication/')) return reply(200, goodUser)
    if (url.endsWith('/authorization/sources/built_in_database/rules/all')) return reply(200, { rules: [{ topic: '#', action: 'all', permission: 'deny' }] })
    if (url.includes('/authorization/')) return reply(200, goodAcl)
    throw Error('unexpected request')
  })
  assert.equal(result.ok, true)
})

test('a preexisting account without our exact topic ACL is never overwritten', async () => {
  let credentialWrites = 0
  const result = await provisionFrameMqtt('frm_future', base, async (url, init) => {
    if (init.method === 'PUT' && url.includes('/authentication/')) credentialWrites++
    if (url.includes('/authentication/')) return reply(200, goodUser)
    if (url.includes('/authorization/')) return reply(404)
    throw Error('unexpected request')
  })
  assert.deepEqual(result, { ok: false, reason: 'authorization' })
  assert.equal(credentialWrites, 0)
})

test('Serverless provider and unsupported management routes fail closed without leaking credentials', async () => {
  let count = 0
  const fail = async () => { count++; return reply(404) }
  assert.deepEqual(await provisionFrameMqtt('frm_future', { ...base, provider: 'emqx_serverless' }, fail),
    { ok: false, reason: 'broker_unsupported' })
  assert.equal(count, 0)
  assert.deepEqual(await provisionFrameMqtt('frm_future', base, fail),
    { ok: false, reason: 'broker_unsupported' })
  assert.equal(count, 2)
})

test('malicious or unexpected accounts and permissions cannot obtain a password', async () => {
  const superuser = await provisionFrameMqtt('frm_future', base, async (url) => {
    if (url.includes('/authentication/')) return reply(200, { ...goodUser, is_superuser: true })
    return reply(200, goodAcl)
  })
  assert.deepEqual(superuser, { ok: false, reason: 'authorization' })
  for (const rules of [
    [{ topic: '#', action: 'subscribe', permission: 'allow' }],
    [{ topic: goodAcl.rules[0].topic, action: 'all', permission: 'allow' }],
    [goodAcl.rules[0], { topic: '#', action: 'all', permission: 'allow' }],
    [{ ...goodAcl.rules[0], username_re: '.*' }],
  ]) {
    assert.equal(exactDeviceRule({ username: goodUser.user_id, rules }, goodUser.user_id, 'frm_future'), false)
  }
})

test('deny-all broker fallback is required, so extra subscriptions cannot be allowed by default', async () => {
  const result = await provisionFrameMqtt('frm_future', base, async (url) => {
    if (url.includes('/authentication/')) return reply(200, goodUser)
    if (url.endsWith('/authorization/sources/built_in_database/rules/all')) return reply(200, { rules: [] })
    if (url.includes('/authorization/')) return reply(200, goodAcl)
    throw Error('unexpected request')
  })
  assert.deepEqual(result, { ok: false, reason: 'authorization' })
})

test('HTTPS and exact management URL are mandatory', async () => {
  let count = 0
  for (const managementUrl of [
    'http://broker.example/api/v5', 'https://broker.example/evil',
    'https://broker.example/api/v5?token=bad', 'https://user:pass@broker.example/api/v5',
  ]) {
    assert.deepEqual(await provisionFrameMqtt('frm_future', { ...base, managementUrl }, async () => {
      count++
      throw Error('no')
    }), { ok: false, reason: 'configuration' })
  }
  assert.equal(count, 0)
})

test('client uses universal runtime broker trust, authenticated paired-device endpoint, and no hardcoded frame ID', () => {
  const route = readFileSync(new URL('../app/api/device/mqtt-pilot/credentials/route.ts', import.meta.url), 'utf8')
  const fw = readFileSync(new URL('../frame/src/network/MqttPushPilot.cpp', import.meta.url), 'utf8')
  assert.match(route, /authenticatePhysicalDevice\(req, deviceId\)/)
  assert.match(route, /from\('device_members'\)/)
  assert.match(route, /provisionFrameMqtt\(deviceId\)/)
  assert.match(route, /mqttEnabledForDevice\(deviceId\)/)
  assert.match(route, /private, no-store, max-age=0/)
  assert.match(fw, /doc\["broker_host"\]/)
  assert.match(fw, /doc\["broker_port"\]/)
  assert.match(fw, /doc\["broker_ca_pem"\]/)
  assert.match(fw, /g_mqtt\.setServer\(g_brokerHost\.c_str\(\), brokerPort\)/)
  assert.doesNotMatch(fw, /g_mqtt\.connect\(clientId\.c_str\(\), id\.c_str\(\), deviceToken\.c_str\(\)\)/)
})
