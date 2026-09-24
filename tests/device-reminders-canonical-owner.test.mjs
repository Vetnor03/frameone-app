import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
const start = route.indexOf('async function sharedDeviceIdsForFrame')
const end = route.indexOf('function normalizeLimit', start)
const helper = route.slice(start, end)

test('Reminders uses the canonical devices.owner_user_id ownership column', () => {
  assert.match(helper, /\.select\('owner_user_id'\)/)
  assert.match(helper, /\.eq\('owner_user_id', ownerUserId\)/)
})

test('Reminders no longer probes removed devices.owner_id or devices.user_id columns', () => {
  assert.doesNotMatch(helper, /\.select\('(?:id, device_id, )?(?:owner_id|user_id)'\)/)
  assert.doesNotMatch(helper, /\.eq\('(?:owner_id|user_id)',/)
})
