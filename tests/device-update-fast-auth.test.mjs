import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const auth = readFileSync(new URL('../app/lib/device/updateStateAuth.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/device/update-state/request/route.ts', import.meta.url), 'utf8')

function userAuthBody() {
  const start = auth.indexOf('export async function authenticateUserForDevice')
  const end = auth.indexOf('export async function authenticatePhysicalDevice', start)
  return auth.slice(start, end)
}

test('app Update authorization verifies the supplied JWT with getClaims', () => {
  const body = userAuthBody()
  assert.match(body, /supabase\.auth\.getClaims\(token\)/)
  assert.match(body, /claimsData\?\.claims\?\.sub/)
  assert.doesNotMatch(body, /supabase\.auth\.getUser\(/)
})

test('verified claim subject is still checked against device membership', () => {
  const body = userAuthBody()
  assert.match(body, /\.from\('device_members'\)/)
  assert.match(body, /\.eq\('device_id', deviceId\)/)
  assert.match(body, /\.eq\('user_id', userId\)/)
})

test('Update request reports auth, RPC and total latency', () => {
  assert.match(route, /auth_ms: authMs/)
  assert.match(route, /rpc_ms: rpcMs/)
  assert.match(route, /total_ms: Date\.now\(\) - requestStartedAt/)
})
