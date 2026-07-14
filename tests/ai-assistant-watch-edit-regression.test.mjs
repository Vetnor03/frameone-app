import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260714224500_repair_ai_assistant_watch_edit_rpc.sql', import.meta.url), 'utf8')

test('frontend calls only the two-parameter watch edit RPC and logs non-sensitive RPC diagnostics', () => {
  assert.match(assistant, /rpc\('update_ai_assistant_watch_request', \{\s*p_watch_id: id,\s*p_original_request: validation\.clean,\s*\}\)/)
  assert.match(assistant, /console\.error\('\[ai-assistant:watch-edit-failed\]', \{[\s\S]*code: error\.code,[\s\S]*message: error\.message,[\s\S]*details: error\.details,[\s\S]*hint: error\.hint,[\s\S]*watchId: id,[\s\S]*\}\)/)
  const logStatements = assistant.match(/console\.error\('\[ai-assistant:watch-edit-failed\]'[^\n]*(?:\n\s+[^\n]*){0,8}/g) ?? []
  assert.ok(logStatements.length >= 2)
  for (const statement of logStatements) {
    assert.doesNotMatch(statement, /validation\.clean|editingRequest/)
  }
})

test('database migration leaves one callable watch edit signature and reloads PostgREST', () => {
  assert.match(migration, /pg_get_function_identity_arguments[\s\S]*pg_proc/)
  assert.match(migration, /drop function if exists public\.update_ai_assistant_watch_request\(uuid, text, text, integer, text, text, text, boolean\)/)
  assert.match(migration, /drop function if exists public\.update_ai_assistant_watch_request\(uuid, text, text, boolean\)/)
  assert.match(migration, /function public\.update_ai_assistant_watch_request\(\s*p_watch_id uuid,\s*p_original_request text\s*\)/)
  assert.match(migration, /revoke execute on function public\.update_ai_assistant_watch_request\(uuid, text\) from public, anon/)
  assert.match(migration, /grant execute on function public\.update_ai_assistant_watch_request\(uuid, text\) to authenticated/)
  assert.match(migration, /notify pgrst, 'reload schema'/)
})

test('saving updates only original_request, preserves watch id and settings, and creates no queue run', () => {
  assert.match(migration, /set original_request = cleaned_request/)
  assert.match(migration, /where id = p_watch_id and owner_user_id = auth\.uid\(\)/)
  assert.match(migration, /return updated_watch/)
  assert.match(migration, /raise exception 'watch_not_found_or_not_owned'/)
  assert.doesNotMatch(migration, /title\s*=|status\s*=|frequency_minutes\s*=|preferred_language\s*=|completion_condition\s*=|show_on_frame\s*=|frame_id\s*=|next_check_at\s*=|interpretation_status\s*=/)
  assert.doesNotMatch(migration, /insert into public\.monitoring_queue|enqueue_ai_assistant_interpretation|insert into public\.monitoring_runs/)
  assert.match(assistant, /setSelectedId\(id\)/)
})

test('owner can manage watches but shared-frame non-owner cannot see management buttons', () => {
  assert.match(assistant, /owner_user_id: string/)
  assert.match(assistant, /select\('id,owner_user_id,original_request/)
  assert.match(assistant, /supabase\.auth\.getUser\(\)/)
  assert.match(assistant, /const canManageWatch = currentUserId === w\.owner_user_id/)
  assert.match(assistant, /\{canManageWatch && <div[\s\S]*\{c\.edit\}[\s\S]*\{busy \? c\.deleting : c\.delete\}/)
  assert.match(assistant, /\{canManageWatch && editingId === w\.id &&/)
})

test('save failure preserves editor typed value and loading state always clears', () => {
  const errorBranch = assistant.match(/if \(error\) \{[\s\S]*?\n      \}/)?.[0] ?? ''
  assert.match(errorBranch, /setError\(c\.friendlyError\)[\s\S]*return/)
  assert.doesNotMatch(errorBranch, /setEditingId\(null\)|setEditingRequest/)
  assert.match(assistant, /finally \{\s*setBusyWatchId\(null\)\s*\}/)
})
