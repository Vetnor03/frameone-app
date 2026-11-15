import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { ablyAutoConfigured, ablyAutoForPairedDevice } from '../app/lib/device/mqttRollout.ts'
import { isAblyAutoEligibleForDevice } from '../app/lib/device/mqttAutoOnboard.ts'
import { publishPilotRevision, publishPilotActivity } from '../app/lib/device/mqttPilotPublish.ts'
import { revokeAblyFrameTokens } from '../app/lib/device/mqttAbly.ts'

const key = 'appID.keyID:' + 'd'.repeat(32)
const ca = '-----BEGIN CERTIFICATE-----\ntest CA fixture\n-----END CERTIFICATE-----'
const since = '2026-11-16T00:00:00.000Z'
const enabled = {
  fleetEnabled: 'false', fleetProvider: 'ably_jwt_v1',
  ablyAutoEnabled: 'true', ablyAutoPairedSince: since,
  ablyApiKey: key, ablyRootCaPem: ca,
}

function database({ pairedAt = '2026-11-16T00:01:00.000Z', members = 1, error = false } = {}) {
  const called = []
  return {
    called,
    from(table) {
      called.push(table)
      if (table === 'devices') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: pairedAt === null ? null : { paired_at: pairedAt },
          error: error ? new Error('database unavailable') : null,
        }) }) }),
      }
      if (table === 'device_members') return {
        select: () => ({ eq: () => ({ limit: async () => ({
          data: Array.from({ length: members }, () => ({ device_id: 'frm_new' })),
          error: error ? new Error('database unavailable') : null,
        }) }) }),
      }
      throw Error('unexpected table lookup')
    },
  }
}

test('automatic MQTT onboarding is explicitly gated and requires valid UTC cutoff and verified broker config', () => {
  assert.equal(ablyAutoConfigured(enabled), true)
  const invalid = [
    { ablyAutoEnabled: 'false' }, { ablyAutoEnabled: undefined },
    { ablyAutoPairedSince: undefined }, { ablyAutoPairedSince: '2026-11-16' },
    { ablyAutoPairedSince: '2026-11-16T00:00:00Z' },
    { ablyAutoPairedSince: '2026-11-16T00:00:00.000+01:00' },
    { ablyAutoPairedSince: '2026-13-16T00:00:00.000Z' },
    { ablyApiKey: undefined }, { ablyRootCaPem: undefined },
    { fleetProvider: 'emqx_dedicated_v5' },
  ]
  for (const overrides of invalid) assert.equal(ablyAutoConfigured({ ...enabled, ...overrides }), false)
})

test('only current member frames paired at or after the cutoff become eligible', () => {
  assert.equal(ablyAutoForPairedDevice('frm_new', since, true, enabled), true)
  assert.equal(ablyAutoForPairedDevice('frm_new', '2026-11-17T13:00:00Z', true, enabled), true)
  assert.equal(ablyAutoForPairedDevice('frm_old', '2026-11-15T23:59:59.999Z', true, enabled), false)
  assert.equal(ablyAutoForPairedDevice('frm_removed', since, false, enabled), false)
  assert.equal(ablyAutoForPairedDevice('frm_unpaired', null, true, enabled), false)
  assert.equal(ablyAutoForPairedDevice('bad/#', since, true, enabled), false)
  assert.equal(ablyAutoForPairedDevice('frm_new', since, true, { ...enabled, ablyAutoEnabled: 'false' }), false)
})

test('automatic enrollment lookup requires paired_at, live membership and available database', async () => {
  const valid = database()
  assert.equal(await isAblyAutoEligibleForDevice('frm_new', enabled, valid), true)
  assert.deepEqual(valid.called, ['devices', 'device_members'])
  assert.equal(await isAblyAutoEligibleForDevice('frm_new', enabled, database({ members: 0 })), false)
  assert.equal(await isAblyAutoEligibleForDevice('frm_new', enabled, database({ pairedAt: null })), false)
  assert.equal(await isAblyAutoEligibleForDevice('frm_new', enabled, database({ pairedAt: '2026-11-15T12:00:00Z' })), false)
  assert.equal(await isAblyAutoEligibleForDevice('frm_new', enabled, database({ error: true })), false)
  const disabled = database()
  assert.equal(await isAblyAutoEligibleForDevice('frm_new', { ...enabled, ablyAutoEnabled: 'false' }, disabled), false)
  assert.deepEqual(disabled.called, [])
})

test('automatic new-frame MQTT hints use only its Ably channel; disabled and removed devices get no publish', async () => {
  const calls = []
  const fakeFetch = async (url, init) => {
    calls.push({ url, init })
    return { ok: true, status: 201 }
  }
  const approved = async () => true
  const removed = async () => false
  assert.equal(await publishPilotRevision('frm_new', 42, enabled, fakeFetch, approved), 'published')
  assert.equal(await publishPilotActivity('frm_new', enabled, fakeFetch, approved), 'published')
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'https://main.realtime.ably.net/channels/remind%2Fpilot%2Frevisions%2Ffrm_new/messages')
  assert.deepEqual(JSON.parse(calls[1].init.body), { name: 'mqtt-hint', data: 'active:120' })
  assert.equal(await publishPilotRevision('frm_removed', 43, enabled, fakeFetch, removed), 'disabled')
  assert.equal(await publishPilotActivity('frm_removed', enabled, fakeFetch, removed), 'disabled')
  assert.equal(calls.length, 2)
  assert.equal(await publishPilotRevision('frm_new', 44, { ...enabled, ablyAutoEnabled: 'false' }, fakeFetch, approved), 'disabled')
  assert.equal(calls.length, 2)
})

test('owner frame deletion revokes MQTT after member and token removal but shared-member departure does not', () => {
  const route = readFileSync(new URL('../app/api/frame/delete/route.ts', import.meta.url), 'utf8')
  const reset = route.indexOf('const reset = await resetDevicePairingState')
  const revoke = route.indexOf('const revoked = await revokeAblyFrameTokens(deviceId)')
  assert.ok(revoke > reset)
  assert.ok(route.indexOf('return NextResponse.json({ ok: true, reset: false })') < reset)
  assert.match(route, /errors\.push\(\{ step: 'revoke_ably_mqtt'/)
  const credentials = readFileSync(new URL('../app/api/device/mqtt-pilot/credentials/route.ts', import.meta.url), 'utf8')
  assert.match(credentials, /authenticatePhysicalDevice\(req, deviceId\)/)
  assert.match(credentials, /if \(!members\?\.length\)/)
  assert.match(credentials, /isAblyAutoEligibleForDevice\(deviceId, undefined, auth\.supabase\)/)
})

test('Ably revocation is scoped to exact frame client ID with bounded REST call', async () => {
  let request
  const result = await revokeAblyFrameTokens('frm_new', key, async (url, init) => {
    request = { url, init }
    return { ok: true, status: 201 }
  }, 1794796800000)
  assert.equal(result, 'revoked')
  assert.equal(request.url, 'https://main.realtime.ably.net/keys/appID.keyID/revokeTokens')
  assert.equal(request.init.method, 'POST')
  assert.equal(request.init.redirect, 'error')
  assert.equal(request.init.headers.authorization, 'Basic ' + Buffer.from(key).toString('base64'))
  assert.deepEqual(JSON.parse(request.init.body), {
    targets: ['clientId:frm_new'],
    issuedBefore: 1794796800000,
    allowReauthMargin: false,
  })
  assert.equal(await revokeAblyFrameTokens('bad/#', key, async () => { throw Error('must not call') }), 'failed')
  assert.equal(await revokeAblyFrameTokens('frm_new', undefined, async () => { throw Error('must not call') }), 'not_configured')
  assert.equal(await revokeAblyFrameTokens('frm_new', key, async () => ({ ok: false, status: 403 })), 'failed')
  assert.equal(await revokeAblyFrameTokens('frm_new', key, async () => { throw Error('offline') }), 'failed')
})
