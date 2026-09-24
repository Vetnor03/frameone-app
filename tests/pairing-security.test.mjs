import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/20260924192134_block_pairing_for_owned_devices.sql', import.meta.url), 'utf8')
const deleteRoute = readFileSync(new URL('../app/api/frame/delete/route.ts', import.meta.url), 'utf8')

test('new pairing codes are refused for frames that are already owned or have members', () => {
  assert.match(migration, /owner_user_id is not null/)
  assert.match(migration, /from public\.device_members/)
  assert.match(migration, /device_already_paired/)
})

test('owner delete clears the canonical owner so deliberate re-pairing remains possible', () => {
  assert.match(deleteRoute, /owner_user_id: null/)
  assert.match(deleteRoute, /device_token: null/)
  assert.match(deleteRoute, /device_token_hash: null/)
})
