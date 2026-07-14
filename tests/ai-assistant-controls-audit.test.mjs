import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260714210000_fix_ai_assistant_watch_controls.sql', import.meta.url), 'utf8')
const simplifiedEditMigration = readFileSync(new URL('../supabase/migrations/20260714224500_repair_ai_assistant_watch_edit_rpc.sql', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts', import.meta.url), 'utf8')
const foundation = readFileSync(new URL('../supabase/migrations/20260713130000_add_monitoring_watch_foundation.sql', import.meta.url), 'utf8')

test('edit opens with the existing natural-language request and only saves that owner-owned field', () => {
  assert.match(assistant, /function openEditor\(w: AssistantWatch\)/)
  assert.match(assistant, /setEditingRequest\(w\.original_request\)/)
  for (const field of ['title: w.title', 'frequency_minutes: w.frequency_minutes', 'preferred_language: w.preferred_language', 'completion_condition: w.completion_condition', 'show_on_frame: Boolean']) assert.doesNotMatch(assistant, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(assistant, /rpc\('update_ai_assistant_watch_request'/)
  assert.match(simplifiedEditMigration, /set original_request = cleaned_request/)
  assert.match(simplifiedEditMigration, /where id = p_watch_id and owner_user_id = auth\.uid\(\)/)
  assert.doesNotMatch(simplifiedEditMigration, /set[\s\S]*title =|status =|frequency_minutes =|preferred_language =|completion_condition =|show_on_frame =|frame_id =|insert into public\.monitoring_queue/)
})

test('save, cancel, failure, and duplicate-submit protections are present', () => {
  assert.match(assistant, /if \(busyWatchId\) return/)
  assert.match(assistant, /setError\(c\.friendlyError\)/)
  assert.match(assistant, /setEditingId\(null\)[\s\S]*setSelectedId\(id\)[\s\S]*await loadAssistant\(\)/)
  assert.match(assistant, /onClick=\{\(\) => setEditingId\(null\)\}/)
  assert.match(assistant, /disabled=\{busy\}/)
})

test('pause persists, preserves history, drains open queue, and scheduled work excludes paused watches', () => {
  assert.match(foundation, /status text not null default 'active'/)
  assert.match(foundation, /check \(status in \('active','paused','completed','error'\)\)/)
  assert.match(migration, /set status = 'paused'/)
  assert.match(migration, /update public\.monitoring_queue[\s\S]*last_error = 'watch_paused'/)
  assert.doesNotMatch(migration, /delete from public\.monitoring_updates[\s\S]*pause_ai_assistant_watch/)
  assert.match(foundation, /where status = 'active' and next_check_at <= now\(\)/)
  assert.match(worker, /watch\.status === 'paused'/)
})

test('resume persists active state without immediate manufactured update', () => {
  assert.match(migration, /set status = 'active'[\s\S]*next_check_at = greatest\(coalesce\(next_check_at, now\(\)\), now\(\)\)/)
  const resumeBody = migration.match(/function public\.resume_ai_assistant_watch[\s\S]*?end; \$\$/)?.[0] ?? ''
  assert.doesNotMatch(resumeBody, /insert into public\.monitoring_updates|insert into public\.monitoring_queue/)
})

test('read unread and mark all persist through Supabase and refetch without exposing dismiss', () => {
  assert.match(assistant, /markUpdate\(u\.id, \{ is_read: !u\.is_read \}\)/)
  assert.match(assistant, /function markAllRead\(\)/)
  assert.match(assistant, /\.update\(\{ is_read: true \}\)\.in\('id', ids\)/)
  assert.doesNotMatch(assistant, /markUpdate\(u\.id, \{ dismissed_from_frame: true \}\)/)
  assert.doesNotMatch(assistant, /\{c\.dismiss\}/)
  assert.match(assistant, /else await loadAssistant\(\)/)
  assert.match(foundation, /grant update \(is_read, dismissed_from_frame\) on public\.monitoring_updates to authenticated/)
})

test('delete requires confirmation and owner authorization', () => {
  assert.match(assistant, /window\.confirm\(c\.confirmDelete\)/)
  assert.match(assistant, /rpc\('delete_ai_assistant_watch'/)
  assert.match(readFileSync(new URL('../supabase/migrations/20260713143000_add_ai_assistant_creation_rpc.sql', import.meta.url), 'utf8'), /delete from public\.monitoring_watches[\s\S]*where id = p_watch_id and owner_user_id = auth\.uid\(\)/)
})

test('shared-frame users can read shared watches but cannot manage another owner watch', () => {
  assert.match(foundation, /can_access_monitoring_watch/)
  assert.match(foundation, /dm\.device_id = w\.frame_id and dm\.user_id = auth\.uid\(\)/)
  for (const fn of ['update_ai_assistant_watch_request', 'pause_ai_assistant_watch', 'resume_ai_assistant_watch']) {
    assert.match((fn === 'update_ai_assistant_watch_request' ? simplifiedEditMigration : migration), new RegExp(`function public\\.${fn}[\\s\\S]*?owner_user_id = auth\\.uid\\(\\)`))
  }
})
