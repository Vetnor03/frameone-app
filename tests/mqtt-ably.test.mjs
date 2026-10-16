import assert from 'node:assert/strict'
import test from 'node:test'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ablyCanaryForDevice, mqttEnabledForDevice } from '../app/lib/device/mqttRollout.ts'
import { publishPilotRevision } from '../app/lib/device/mqttPilotPublish.ts'
import {
  ABLY_MQTT_HOST, ABLY_MQTT_PORT, ABLY_TOKEN_TTL_SEC,
  makeAblyFrameCredentials, publishAblyFrameHint,
} from '../app/lib/device/mqttAbly.ts'

const key = 'appID.keyID:' + 'd'.repeat(32)
const ca = '-----BEGIN CERTIFICATE-----\ntest CA fixture\n-----END CERTIFICATE-----'
const base = {
  pilotEnabled: 'false',
  fleetEnabled: 'true',
  fleetProvider: 'ably_jwt_v1',
  ablyApiKey: key,
  ablyRootCaPem: ca,
}
const unpack = token => {
  const [header, payload, signature] = token.split('.')
  return {
    header: JSON.parse(Buffer.from(header, 'base64url')),
    claims: JSON.parse(Buffer.from(payload, 'base64url')),
    signature, unsigned: header + '.' + payload,
  }
}

test('fleet Ably activates independently of EMQX pilot and fails closed on incomplete config', () => {
  assert.equal(mqttEnabledForDevice('frm_one', base), true)
  assert.equal(mqttEnabledForDevice('frm_one', { ...base, fleetEnabled: 'false' }), false)
  assert.equal(mqttEnabledForDevice('frm_one', { ...base, ablyApiKey: undefined }), false)
  assert.equal(mqttEnabledForDevice('frm_one', { ...base, ablyRootCaPem: undefined }), false)
  assert.equal(mqttEnabledForDevice('frm_one', { ...base, ablyRootCaPem: 'not PEM' }), false)
  assert.equal(mqttEnabledForDevice('bad/#', base), false)
  assert.equal(mqttEnabledForDevice('frm_original', {
    ...base, fleetEnabled: 'false', pilotEnabled: 'true', pilotDeviceId: 'frm_original',
  }), true)
})

test('one paired frame can opt into Ably without enabling the fleet or disturbing EMQX', () => {
  const canary = {
    pilotEnabled: 'true', pilotDeviceId: 'frm_emqx_legacy',
    fleetEnabled: 'false', fleetProvider: 'ably_jwt_v1',
    ablyCanaryEnabled: 'true', ablyCanaryDeviceId: 'frm_active',
    ablyApiKey: key, ablyRootCaPem: ca,
  }
  assert.equal(ablyCanaryForDevice('frm_active', canary), true)
  assert.equal(ablyCanaryForDevice('frm_other', canary), false)
  assert.equal(mqttEnabledForDevice('frm_active', canary), true)
  assert.equal(mqttEnabledForDevice('frm_emqx_legacy', canary), true)
  assert.equal(mqttEnabledForDevice('frm_other', canary), false)
  assert.equal(mqttEnabledForDevice('frm_active', { ...canary, ablyCanaryEnabled: 'false' }), false)
  assert.equal(mqttEnabledForDevice('frm_active', { ...canary, ablyApiKey: undefined }), false)
  assert.equal(mqttEnabledForDevice('frm_active', { ...canary, ablyRootCaPem: undefined }), false)
})

test('Ably canary routes hints correctly, preserving old EMQX and disabled other frames', async () => {
  const config = {
    enabled: 'true', pilotDeviceId: 'frm_emqx_legacy',
    fleetEnabled: 'false', fleetProvider: 'ably_jwt_v1',
    ablyCanaryEnabled: 'true', ablyCanaryDeviceId: 'frm_active',
    ablyApiKey: key, ablyRootCaPem: ca,
    publishUrl: 'https://legacy.example/api/v5/publish',
    apiKey: 'pilot-key', apiSecret: 'pilot-secret',
  }
  const calls = []
  const fakeFetch = async (url, init) => {
    calls.push({ url, init })
    return { ok: true, status: 201 }
  }
  assert.equal(await publishPilotRevision('frm_active', 72, config, fakeFetch), 'published')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://main.realtime.ably.net/channels/remind%2Fpilot%2Frevisions%2Ffrm_active/messages')
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: 'mqtt-hint', data: '72' })

  assert.equal(await publishPilotRevision('frm_emqx_legacy', 73, config, fakeFetch), 'published')
  assert.equal(calls.length, 2)
  assert.equal(calls[1].url, 'https://legacy.example/api/v5/publish')
  assert.equal(JSON.parse(calls[1].init.body).topic, 'remind/pilot/revisions/frm_emqx_legacy')

  assert.equal(await publishPilotRevision('frm_other', 74, config, fakeFetch), 'disabled')
  assert.equal(calls.length, 2)
})

test('JWT is signed, scoped to one frame subscribe-only, short lived and unique by identity', () => {
  const at = 1800000000
  const a = makeAblyFrameCredentials('frm_one', key, at)
  const b = makeAblyFrameCredentials('frm_two', key, at)
  assert.ok(a)
  assert.ok(b)
  assert.equal(a.password, '')
  assert.equal(a.mqtt_auth, 'ably_jwt_v1')
  assert.equal(a.token_ttl_sec, 3600)
  assert.notEqual(a.username, b.username)
  assert.ok(a.username.length > 200 && a.username.length < 1400)
  const decoded = unpack(a.username)
  assert.deepEqual(decoded.header, { typ: 'JWT', alg: 'HS256', kid: 'appID.keyID' })
  assert.deepEqual(decoded.claims, {
    iat: at, exp: at + ABLY_TOKEN_TTL_SEC,
    'x-ably-clientId': 'frm_one',
    'x-ably-capability': '{"remind/pilot/revisions/frm_one":["subscribe"]}',
  })
  assert.equal(decoded.signature,
    createHmac('sha256', 'd'.repeat(32)).update(decoded.unsigned).digest('base64url'))
  assert.deepEqual(JSON.parse(unpack(b.username).claims['x-ably-capability']),
    { 'remind/pilot/revisions/frm_two': ['subscribe'] })
  assert.equal(makeAblyFrameCredentials('frm_one', '', at), null)
  assert.equal(makeAblyFrameCredentials('frm_one', 'bad:short', at), null)
  assert.equal(makeAblyFrameCredentials('bad/#', key, at), null)
})

test('REST hint publishes only exact device channel with server-only API key', async () => {
  let called
  const result = await publishAblyFrameHint('frm_one', 'active:120', key, async (url, init) => {
    called = { url, init }
    return { ok: true, status: 201 }
  })
  assert.equal(result, 'published')
  assert.equal(called.url,
    'https://main.realtime.ably.net/channels/remind%2Fpilot%2Frevisions%2Ffrm_one/messages')
  assert.equal(called.init.method, 'POST')
  assert.equal(called.init.redirect, 'error')
  assert.equal(called.init.headers.authorization, 'Basic ' + Buffer.from(key).toString('base64'))
  assert.deepEqual(JSON.parse(called.init.body), { name: 'mqtt-hint', data: 'active:120' })
  assert.equal(await publishAblyFrameHint('bad/#', '1', key, async () => {
    throw Error('should not call')
  }), 'failed')
  assert.equal(await publishAblyFrameHint('frm_one', '42', key, async () => {
    throw Error('Ably offline')
  }), 'failed')
  assert.equal(await publishAblyFrameHint('frm_one', '42', key, async () => ({
    ok: false, status: 403,
  })), 'failed')
})

test('backend requires physical device auth and pairing before issuing Ably JWT', () => {
  const route = readFileSync(new URL('../app/api/device/mqtt-pilot/credentials/route.ts', import.meta.url), 'utf8')
  assert.match(route, /authenticatePhysicalDevice\(req, deviceId\)/)
  assert.match(route, /from\('device_members'\)/)
  assert.match(route, /if \(!members\?\.length\)/)
  assert.match(route, /MQTT_FLEET_ENABLED !== 'true'/)
  assert.match(route, /MQTT_ABLY_CANARY_ENABLED/)
  assert.match(route, /MQTT_ABLY_CANARY_DEVICE_ID/)
  assert.match(route, /ablyCanaryForDevice\(deviceId/)
  assert.match(route, /makeAblyFrameCredentials\(deviceId, process\.env\.MQTT_ABLY_API_KEY\)/)
  assert.match(route, /broker_host: ABLY_MQTT_HOST/)
  assert.match(route, /broker_port: ABLY_MQTT_PORT/)
  assert.match(route, /private, no-store, max-age=0/)
  assert.equal(ABLY_MQTT_HOST, 'main.mqtt.ably.net')
  assert.equal(ABLY_MQTT_PORT, 8883)
})

test('firmware supports short-lived MQTT token contract while EMQX remains backward compatible', () => {
  const fw = readFileSync(new URL('../frame/src/network/MqttPushPilot.cpp', import.meta.url), 'utf8')
  assert.match(fw, /doc\["mqtt_auth"\]/)
  assert.match(fw, /doc\["token_ttl_sec"\]/)
  assert.match(fw, /strcmp\(authMode, "ably_jwt_v1"\)/)
  assert.match(fw, /mqttPassword\[0\] != '\\0'/)
  assert.match(fw, /setKeepAlive\(ablyToken \? 60 : 90\)/)
  assert.match(fw, /ablyToken \? nullptr : password\.c_str\(\)/)
  assert.match(fw, /subscribe\(g_topic\.c_str\(\), ablyToken \? 0 : 1\)/)
  assert.match(fw, /ABLY_RENEW_AFTER_MS = 50UL \* 60UL \* 1000UL/)
  assert.match(fw, /g_mqtt\.disconnect\(\)/)
  assert.match(fw, /receivedCa\.isEmpty\(\)/)
})
