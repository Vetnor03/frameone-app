import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/frame/delete/route.ts', import.meta.url), 'utf8')

test('owner frame delete resets device instead of removing only the requester membership', () => {
  assert.match(route, /isOwnerRole/)
  assert.match(route, /deleteByDeviceId\(supabase, 'device_settings', deviceId, errors\)/)
  assert.match(route, /deleteByDeviceId\(supabase, 'device_status', deviceId, errors\)/)
  assert.match(route, /deleteByDeviceId\(supabase, 'device_members', deviceId, errors\)/)
  assert.match(route, /resetDevicePairingState\(supabase, deviceId, errors\)/)
})

test('owner frame reset clears pairing ownership and token candidates without touching user data tables', () => {
  assert.match(route, /owner_id: null/)
  assert.match(route, /user_id: null/)
  assert.match(route, /device_token: null/)
  assert.match(route, /device_token_hash: null/)
  assert.match(route, /paired: false/)
  assert.doesNotMatch(route, /from\('reminders'\)\.delete/)
  assert.doesNotMatch(route, /from\('grocery_items'\)\.delete/)
  assert.doesNotMatch(route, /from\('countdown_events'\)\.delete/)
})
