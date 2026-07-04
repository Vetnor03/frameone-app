import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const deleteRoute = readFileSync(new URL('../app/api/frame/delete/route.ts', import.meta.url), 'utf8')

test('frame deletion is owner-only and removes every app membership', () => {
  assert.match(deleteRoute, /member\.data\.role !== 'owner'/)
  assert.match(deleteRoute, /owner_required/)
  assert.match(deleteRoute, /\.from\('device_members'\)\.delete\(\)\.eq\('device_id', deviceId\)/)
  assert.doesNotMatch(deleteRoute, /\.eq\('user_id', userId\)[\s\S]*delete_device_members/)
})

test('frame deletion resets device state without deleting user-owned data', () => {
  assert.match(deleteRoute, /async function resetFrameToUnpaired/)
  assert.match(deleteRoute, /clearDeviceIdentity\(supabase, deviceId\)/)
  assert.match(deleteRoute, /device_token: null/)
  assert.match(deleteRoute, /DEVICE_RESET_TABLES = \['device_settings', 'device_status'\]/)

  for (const userOwnedTable of ['reminders', 'grocery_items', 'countdown_events', 'custom_surf_spots', 'user_surf_experiences']) {
    assert.doesNotMatch(deleteRoute, new RegExp(`\\.from\\('${userOwnedTable}'\\)\\.delete`))
  }
})
