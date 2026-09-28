import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const server = readFileSync(new URL('../app/staging/security-check/page.tsx', import.meta.url), 'utf8')
const client = readFileSync(new URL('../app/staging/security-check/StagingSecurityCheckClient.tsx', import.meta.url), 'utf8')

test('security check page is gated to the independent Vercel and Supabase staging projects', () => {
  assert.match(server, /VERCEL_PROJECT_ID === 'prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR'/)
  assert.match(server, /NEXT_PUBLIC_SUPABASE_URL === 'https:\/\/ouwhfzjaahdipwmelzvf\.supabase\.co'/)
  assert.match(server, /if \(!isolatedStaging\) notFound\(\)/)
})

test('uses only the two real synthetic fixture identities and real caller session', () => {
  assert.match(client, /tester-a@re-mind\.test/)
  assert.match(client, /tester-b@re-mind\.test/)
  assert.match(client, /frm_FA0000000001/)
  assert.match(client, /frm_FB0000000002/)
  assert.match(client, /supabase\.auth\.getUser\(\)/)
  assert.match(client, /supabase\.auth\.getSession\(\)/)
  assert.match(client, /session\.user\.id !== verified\.user\.id/)
  assert.match(client, /Authorization: 'Bearer ' \+ token/)
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY|admin\.auth\.admin/)
})

test('all checks are same-origin GET, with no credential logging, fixture edits or token issuer calls', () => {
  assert.match(client, /method: 'GET'/)
  assert.match(client, /credentials: 'same-origin'/)
  assert.doesNotMatch(client, /method: 'POST'|method: 'PUT'|method: 'PATCH'|method: 'DELETE'/)
  assert.doesNotMatch(client, /console\.log|console\.info|console\.warn|localStorage\.setItem/)
  assert.doesNotMatch(client, /probe\([\s\S]{0,120}'\/api\/device\/pair\/status/)
  assert.match(client, /intentionally never call the token-minting legacy pairing-status route/)
})

test('test plan includes own and foreign account HTTP authorization, not just UI isolation', () => {
  for (const path of [
    '/api/device/user-frames',
    '/api/device/update-state/status?device_id=',
    '/api/device/mirror-snapshot?device_id=',
    '/api/device/frame-config?device_id=',
    '/api/device/update-state?device_id=',
    '/api/device/status?device_id=',
  ]) assert.ok(client.includes(path), 'missing ' + path)
  assert.match(client, /ids\.includes\(fixture\.own\) && !ids\.includes\(fixture\.other\)/)
  assert.match(client, /other tester’s mirror\/configuration is forbidden/i)
  assert.match(client, /Other tester’s device telemetry is forbidden/)
  assert.match(client, /Invalid bearer cannot fall back to browser cookie for device telemetry/)
})
