import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260714230000_enforce_ai_assistant_watch_owner_limit.sql', import.meta.url), 'utf8')

test('backend creation RPC enforces a per-owner five ongoing Watch limit race-safely', () => {
  assert.match(migration, /create or replace function public\.create_ai_assistant_watch\(p_original_request text, p_frame_id text default null\)/)
  assert.match(migration, /current_user_id uuid := auth\.uid\(\)/)
  assert.match(migration, /if current_user_id is null then raise exception 'not_authenticated'/)
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(current_user_id::text, 0\)\)/)
  assert.match(migration, /mw\.owner_user_id = current_user_id[\s\S]*mw\.status in \('active', 'paused', 'error'\)/)
  assert.match(migration, /owned_ongoing_watch_count >= 5[\s\S]*raise exception 'watch_limit_reached'/)
  assert.doesNotMatch(migration, /status in \('active'\)/)
  assert.match(migration, /dm\.device_id = p_frame_id and dm\.user_id = current_user_id/)
  assert.match(migration, /enqueue_ai_assistant_interpretation\(created_watch\.id, created_watch\.owner_user_id, created_watch\.original_request, now\(\)\)/)
  assert.match(migration, /insert into public\.monitoring_queue \(watch_id, run_after\)/)
  assert.match(migration, /grant execute on function public\.create_ai_assistant_watch\(text,text\) to authenticated/)
  assert.match(migration, /notify pgrst, 'reload schema'/)
})

test('backend limit semantics cover five allowed, sixth blocked, legacy blocked, and slot-freeing statuses', () => {
  assert.match(migration, /owned_ongoing_watch_count >= 5/)
  assert.match(migration, /status in \('active', 'paused', 'error'\)/)
  assert.doesNotMatch(migration, /'completed'[\s\S]*owned_ongoing_watch_count/)
  assert.doesNotMatch(migration, /'deleted'[\s\S]*owned_ongoing_watch_count/)
  assert.match(migration, /owner_user_id = current_user_id/)
})

test('assistant UI counts only current-user-owned ongoing Watches and reuses the shared limit', () => {
  assert.match(assistant, /export const MAX_AI_ASSISTANT_WATCHES = 5/)
  assert.match(assistant, /ONGOING_ASSISTANT_WATCH_STATUSES: AssistantWatchStatus\[\] = \['active', 'paused', 'error'\]/)
  assert.match(assistant, /watches\.filter\(\(w\) => w\.owner_user_id === currentUserId && ONGOING_ASSISTANT_WATCH_STATUSES\.includes\(w\.status\)\)\.length/)
  assert.match(assistant, /ownedOngoingWatchCount >= MAX_AI_ASSISTANT_WATCHES/)
  assert.doesNotMatch(assistant, /watches\.length >= MAX_AI_ASSISTANT_WATCHES/)
  assert.match(assistant, /`\$\{count\} of \$\{MAX_AI_ASSISTANT_WATCHES\} followed`/)
  assert.match(assistant, /`Følger \$\{count\} av \$\{MAX_AI_ASSISTANT_WATCHES\}`/)
})

test('assistant UI disables creation at the limit without clearing typed text', () => {
  assert.match(assistant, /if \(reachedWatchLimit\) \{ setError\(c\.limitReached\); return \}/)
  assert.match(assistant, /disabled=\{creating \|\| reachedWatchLimit\}/)
  assert.match(assistant, /disabled:cursor-not-allowed/)
  const limitGuard = assistant.indexOf('if (reachedWatchLimit) { setError(c.limitReached); return }')
  const rpcCall = assistant.indexOf("rpc('create_ai_assistant_watch'")
  assert.ok(limitGuard > -1 && rpcCall > limitGuard)
  assert.doesNotMatch(assistant.slice(limitGuard, rpcCall), /setRequest\(''\)/)
})

test('assistant UI localizes backend watch_limit_reached errors and logs safe diagnostics only', () => {
  assert.match(assistant, /watch_limit_reached/)
  assert.match(assistant, /setError\(c\.limitReached\)/)
  assert.match(assistant, /You can follow up to \$\{MAX_AI_ASSISTANT_WATCHES\} things/)
  assert.match(assistant, /Du kan følge med på opptil \$\{MAX_AI_ASSISTANT_WATCHES\} ting/)
  assert.match(assistant, /console\.warn\('\[ai-assistant:watch-limit-reached\]', \{ code: error\.code, message: error\.message, ownedOngoingWatchCount \}\)/)
  for (const line of assistant.split('\n').filter((line) => line.includes('console.'))) {
    assert.doesNotMatch(line, /validation\.clean|request[,}]/)
  }
})

test('frame-level shared Watch display is not capped by the per-owner creation limit', () => {
  assert.match(assistant, /watches\.length === 0/)
  assert.match(assistant, /watches\.map\(\(w\)/)
  assert.doesNotMatch(assistant, /watches\.slice\(0, MAX_AI_ASSISTANT_WATCHES\)/)
})
