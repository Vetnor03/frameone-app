import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MAX_FRAME_NAME_LENGTH, normalizeFrameName } from '../app/lib/frameName.mjs'

const ui = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/frame/rename/route.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260905120000_add_shared_frame_display_name.sql', import.meta.url), 'utf8')

test('frame names are trimmed and invalid names are rejected', () => {
  assert.deepEqual(normalizeFrameName('  Kitchen Frame  '), { ok: true, name: 'Kitchen Frame' })
  assert.deepEqual(normalizeFrameName(' \n '), { ok: false, error: 'empty_frame_name' })
  assert.deepEqual(normalizeFrameName('x'.repeat(MAX_FRAME_NAME_LENGTH + 1)), { ok: false, error: 'frame_name_too_long' })
})

test('owner rename persists the shared display name without changing frame identity', () => {
  assert.match(api, /rpc\('rename_owned_frame'/)
  assert.match(migration, /update public\.devices set display_name = clean_name where device_id = p_device_id/)
  assert.match(migration, /jsonb_build_object\('device_id', changed\.device_id, 'display_name', changed\.display_name\)/)
  assert.doesNotMatch(migration, /set\s+device_id\s*=/i)
})

test('shared users receive the persisted name but have no rename action', () => {
  assert.match(ui, /rpc\('get_accessible_frame_names'\)/)
  assert.match(migration, /join public\.device_members m on m\.device_id = d\.device_id[\s\S]+m\.user_id = auth\.uid\(\)/)
  assert.match(ui, /isOwner && <button[^>]+onClick=\{\(\) => beginRename\(f\)\}/)
  assert.match(ui, /f\.display_name\?\.trim\(\)/)
})

test('direct backend rename and RPC both enforce existing owner membership', () => {
  assert.match(migration, /before update of display_name on public\.devices/)
  assert.equal((migration.match(/lower\(role\) = 'owner'/g) || []).length, 2)
  assert.ok((migration.match(/user_id = auth\.uid\(\)/g) || []).length >= 2)
  assert.match(api, /status: forbidden \? 403 : 500/)
})

test('UI updates immediately and then reloads the persisted frame record', () => {
  assert.match(ui, /onFramesChanged\(frames\.map/)
  assert.match(ui, /await reload\(\)/)
  assert.match(ui, /maxLength=\{MAX_FRAME_NAME_LENGTH\}/)
  assert.match(ui, /className="truncate text-base/)
})
