import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const server = readFileSync(new URL('../app/staging/security-check/writes/page.tsx', import.meta.url), 'utf8')
const client = readFileSync(new URL('../app/staging/security-check/writes/StagingWriteCheckClient.tsx', import.meta.url), 'utf8')

test('negative-write page is restricted to the separate staging Vercel project and database', () => {
  assert.match(server, /VERCEL_PROJECT_ID === 'prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR'/)
  assert.match(server, /NEXT_PUBLIC_SUPABASE_URL === 'https:\/\/ouwhfzjaahdipwmelzvf\.supabase\.co'/)
  assert.match(server, /if \(!isolatedStaging\) notFound\(\)/)
})

test('only separate throwaway frames can be write targets, never original virtual fixtures', () => {
  assert.match(client, /frm_FAEE00000001/)
  assert.match(client, /frm_FBEE00000002/)
  assert.doesNotMatch(client, /frm_FA0000000001|frm_FB0000000002/)
  assert.match(client, /staging_disposable_security_fixture !== fixture\.ownMarker/)
  assert.match(client, /ownMember\.data\?\.role !== 'owner' \|\| otherMember\.data/)
  assert.match(client, /device_id: other/)
  assert.doesNotMatch(client, /device_id: fixture\.own/)
})

test('real user identity, matching session, and fixture ownership are required before writing', () => {
  assert.match(client, /supabase\.auth\.getUser\(\)/)
  assert.match(client, /supabase\.auth\.getSession\(\)/)
  assert.match(client, /session\.user\.id !== user\.id/)
  assert.match(client, /ownMember\.error \|\| otherMember\.error \|\| ownSettings\.error/)
  assert.match(client, /No write requests were sent/)
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY|admin\.auth\.admin/)
})

test('foreign frame write probes include settings, rename, update request, heartbeat, and delete', () => {
  for (const endpoint of [
    '/api/device/save-settings', '/api/frame/rename',
    '/api/device/update-state/request', '/api/device/update-state/activity',
    '/api/frame/delete',
  ]) assert.ok(client.includes(endpoint), 'Missing API negative test: ' + endpoint)
  assert.match(client, /expected: 403, error: 'forbidden'/)
  assert.match(client, /expected: 403, error: 'frame_owner_required'/)
  assert.match(client, /expected: 404, error: 'frame_not_found'/)
  assert.match(client, /expected: 401, error: 'missing_auth_token'/)
})

test('stop on first mismatch and do not leak credentials in results or call token-minting pairing route', () => {
  assert.match(client, /if \(!ok\) \{[\s\S]*?return\s*\n\s*\}/)
  assert.match(client, /testCase\.bearer \? \{ Authorization:/)
  assert.doesNotMatch(client, /console\.(log|info|warn)|localStorage\.setItem/)
  assert.doesNotMatch(client, /\/api\/device\/pair\/status|\/api\/device\/pair\/start/)
  assert.doesNotMatch(client, /password:|service_role|Bearer \${token}/)
})
