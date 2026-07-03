import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const mirrorRoute = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
const remindersRoute = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')

test('mirror snapshot resolves an owner-backed user device scope', () => {
  assert.match(mirrorRoute, /async function resolveMirrorDeviceScope/)
  assert.match(mirrorRoute, /'id, device_id, owner_id'/)
  assert.match(mirrorRoute, /'id, device_id, user_id'/)
  assert.match(mirrorRoute, /\.eq\('role', 'owner'\)/)
  assert.match(mirrorRoute, /deviceIds: deviceIds\.length > 0 \? deviceIds : \[deviceId\]/)
  assert.match(mirrorRoute, /storageDeviceIds: storageDeviceIds\.length > 0 \? storageDeviceIds : \[deviceId\]/)
})

test('mirror snapshot keeps frame config current-device scoped but queries legacy module data across user devices', () => {
  assert.match(mirrorRoute, /buildFrameConfigPayload\(supabase, deviceId\)/)
  assert.match(mirrorRoute, /groceriesDetail\(supabase, mirrorScope\.storageDeviceIds, mirrorScope\.ownerId, language\)/)
  assert.match(mirrorRoute, /countdownDetail\(supabase, mirrorScope\.storageDeviceIds, language\)/)
  assert.match(mirrorRoute, /\.from\('grocery_items'\)[\s\S]*?\.in\('device_id', storageDeviceIds\)/)
  assert.match(mirrorRoute, /\.from\('dinner_plan_days'\)[\s\S]*?\.in\('device_id', storageDeviceIds\)/)
  assert.match(mirrorRoute, /\.from\('grocery_item_history'\)[\s\S]*?\.in\('device_id', storageDeviceIds\)/)
  assert.match(mirrorRoute, /\.from\('countdown_events'\)[\s\S]*?\.in\('device_id', storageDeviceIds\)/)
})

test('mirror snapshot queries shared user-owned module tables by owner id', () => {
  assert.match(mirrorRoute, /loadMirrorRecipeRows\(supabase, ownerId\)/)
  assert.match(mirrorRoute, /loadMirrorStoredRecipeSuggestions\(supabase, ownerId\)/)
  assert.match(mirrorRoute, /\.from\('grocery_recipes'\)[\s\S]*?\.eq\(scope\.column, userId\)/)
  assert.match(mirrorRoute, /\.from\('grocery_recipe_suggestions'\)[\s\S]*?\.eq\(scope\.column, userId\)/)
  assert.match(mirrorRoute, /surfDetail\(origin, cfg, bearer, language/)
})


test('device reminders feed also resolves shared manual reminders from owner devices', () => {
  assert.match(remindersRoute, /async function sharedDeviceIdsForFrame/)
  assert.match(remindersRoute, /'id, device_id, owner_id'/)
  assert.match(remindersRoute, /'id, device_id, user_id'/)
  assert.match(remindersRoute, /\.from\('devices'\)[\s\S]*?\.eq\(column, ownerId\)/)
  assert.match(remindersRoute, /\.from\('reminders'\)[\s\S]*?\.in\('device_id', sharedDeviceIds\)/)
  assert.match(remindersRoute, /\.from\('reminder_completions'\)[\s\S]*?\.in\('device_id', sharedDeviceIds\)/)
})
