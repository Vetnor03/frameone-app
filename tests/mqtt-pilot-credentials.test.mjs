import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { pilotCredentialPayload } from '../app/lib/device/mqttPilotCredentials.ts'

const route = readFileSync(new URL('../app/api/device/mqtt-pilot/credentials/route.ts', import.meta.url), 'utf8')
const password = 'x'.repeat(32)
const allow = { enabled: 'true', pilotDeviceId: 'frm_54AE37455F34', framePassword: password }

test('MQTT credentials are never exposed unless the exact pilot device is enabled', () => {
  assert.equal(pilotCredentialPayload('frm_54AE37455F34', { ...allow, enabled: undefined }), null)
  assert.equal(pilotCredentialPayload('frm_other', allow), null)
  assert.equal(pilotCredentialPayload('frm_54AE37455F34', { ...allow, pilotDeviceId: undefined }), null)
  assert.equal(pilotCredentialPayload('frm_54AE37455F34', { ...allow, pilotDeviceId: 'frm/#' }), null)
  assert.equal(pilotCredentialPayload('frm_54AE37455F34', { ...allow, framePassword: 'weak' }), null)
  assert.deepEqual(pilotCredentialPayload('frm_54AE37455F34', allow), {
    username: 'frm_54AE37455F34',
    password,
  })
})

test('credential endpoint is physically authenticated, rejects missing token and prevents caching', () => {
  assert.match(route, /authenticatePhysicalDevice\(req, deviceId\)/)
  assert.doesNotMatch(route, /authenticateUserForDevice|createClient\(\)/)
  assert.match(route, /if \('error' in auth\)/)
  assert.match(route, /pilotCredentialPayload\(deviceId\)/)
  assert.match(route, /private, no-store, max-age=0/)
  assert.match(route, /return NextResponse\.json\(\{ \.\.\.pilot, \.\.\.connection \}, \{ headers: NO_STORE \}\)/)
  assert.match(route, /authenticatePhysicalDevice\(req, deviceId\)/)
  assert.match(route, /\.from\('device_members'\)/)
  assert.match(route, /provisionFrameMqtt\(deviceId\)/)
})

test('publish path rejects other frames even when pilot server is enabled', async () => {
  const { publishPilotRevision } = await import('../app/lib/device/mqttPilotPublish.ts')
  let calls = 0
  const config = { enabled: 'true', pilotDeviceId: 'frm_54AE37455F34',
    publishUrl: 'https://broker.example/api/v5/publish', apiKey: 'key', apiSecret: 'secret' }
  const result = await publishPilotRevision('frm_another', 11, config, async () => {
    calls++
    return { status: 200, ok: true }
  })
  assert.equal(result, 'disabled')
  assert.equal(calls, 0)
})
