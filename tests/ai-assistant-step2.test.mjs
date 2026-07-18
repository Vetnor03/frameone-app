import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const rpc = readFileSync(new URL('../supabase/migrations/20260713143000_add_ai_assistant_creation_rpc.sql', import.meta.url), 'utf8')
const simplifiedEditRpc = readFileSync(new URL('../supabase/migrations/20260714223000_simplify_ai_assistant_watch_edit.sql', import.meta.url), 'utf8')
const foundation = readFileSync(new URL('../supabase/migrations/20260713130000_add_monitoring_watch_foundation.sql', import.meta.url), 'utf8')

test('AI Assistant uses consumer naming and is registered as selectable module', () => {
  assert.match(home, /import AIAssistantTab from '\.\/components\/AIAssistantTab'/)
  assert.match(home, /assistant: 'AI Assistant'/)
  assert.match(home, /assistant: 'KI-assistent'/)
  assert.match(home, /type ModuleKey = 'assistant' \| 'date'/)
  assert.match(home, /const prominentOption: ModuleKey = 'assistant'/)
  assert.match(assistant, /Be RE:MIND holde øye med noe for deg/)
  assert.match(assistant, /Hva skal RE:MIND følge med på\?/)
  assert.match(assistant, /Begynn å følge/)
  assert.doesNotMatch(assistant.match(/heading:[\s\S]*?const MAX_ASSISTANT_REQUEST_LENGTH/)?.[0] ?? '', /provider|GPT|cron|queue|fingerprint|confidence|JSON|API|run history|monitoring/i)
})

test('create RPC validates, cannot spoof ownership or unrelated frames, stays app-only, and schedules internally', () => {
  assert.match(rpc, /owner_user_id,[\s\S]*?\) values \([\s\S]*?auth\.uid\(\)/)
  assert.doesNotMatch(rpc, /p_owner_user_id/)
  assert.match(rpc, /dm\.device_id = p_frame_id and dm\.user_id = auth\.uid\(\)/)
  assert.match(rpc, /raise exception 'frame_not_available'/)
  assert.match(rpc, /show_in_app,[\s\S]*show_on_frame/)
  assert.match(rpc, /true,[\s\S]*false/)
  assert.match(rpc, /frequency_minutes,[\s\S]*60/)
  assert.match(rpc, /next_check_at,[\s\S]*now\(\)/)
  assert.match(rpc, /insert into public\.monitoring_queue \(watch_id, run_after\)/)
  assert.match(rpc, /security definer/)
  assert.match(rpc, /set search_path = public/)
})

test('browser uses narrow RPCs for edit delete pause resume and cannot mutate unsafe task fields directly', () => {
  assert.match(assistant, /rpc\('update_ai_assistant_watch_request'/)
  assert.match(assistant, /pause_ai_assistant_watch/)
  assert.match(assistant, /resume_ai_assistant_watch/)
  assert.match(assistant, /rpc\('delete_ai_assistant_watch'/)
  assert.doesNotMatch(assistant, /from\('monitoring_watches'\)\.update/)
  assert.doesNotMatch(assistant, /from\('monitoring_watches'\)\.delete/)
  const editBody = assistant.match(/async function editWatch[\s\S]*?async function setWatchPaused/)?.[0] ?? ''
  assert.doesNotMatch(editBody, /owner_user_id|show_on_frame|frequency_minutes|next_check_at|search_guidance|p_title|p_completion_condition|p_preferred_language/)
  assert.doesNotMatch(assistant, /select\('\*'\)/)
  assert.doesNotMatch(assistant, /raw_result|response_id|error_message|provider|model|fingerprint|confidence/)
})

test('mutation RPCs are owner-only and edit now changes only the request field', () => {
  for (const fn of ['update_ai_assistant_watch_request', 'pause_ai_assistant_watch', 'resume_ai_assistant_watch', 'delete_ai_assistant_watch']) {
    const re = new RegExp(`function public\\.${fn}[\\s\\S]*?owner_user_id = auth\\.uid\\(\\)`)
    assert.match(rpc, re)
  }
  assert.match(rpc, /revoke insert, update, delete on public\.monitoring_watches from authenticated/)
  assert.match(simplifiedEditRpc, /set original_request = cleaned_request/)
  assert.doesNotMatch(simplifiedEditRpc, /next_check_at =|show_in_app =|show_on_frame =|status =|frequency_minutes =|title =/)
  assert.match(rpc, /set status = 'paused', show_in_app = true, show_on_frame = false/)
  assert.match(rpc, /set status = 'active', frequency_minutes = 60, next_check_at = now\(\), show_in_app = true, show_on_frame = false/)
})

test('update permissions allow only read/dismiss flags and source links are safe', () => {
  assert.match(foundation, /revoke update on public\.monitoring_updates from authenticated/)
  assert.match(foundation, /grant update \(is_read, dismissed_from_frame\) on public\.monitoring_updates to authenticated/)
  assert.match(assistant, /from\('monitoring_updates'\)\.update\(patch\)/)
  assert.match(assistant, /function markUpdate\(id: string, patch: \{ is_read: boolean \}\)/)
  assert.match(assistant, /rel="noopener noreferrer"/)
})

test('development controls are production-safe and do not invoke protected functions from the browser', () => {
  assert.match(assistant, /process\.env\.NODE_ENV !== 'production'/)
  assert.doesNotMatch(assistant, /searchParams|\.get\('dev|process\.env\.(?!NODE_ENV)|OPENAI_API_KEY|SERVICE_ROLE|monitoring-scheduler|monitoring-worker|x-monitoring-secret/i)
})

test('long and meaningless input validation is enforced in UI and database', () => {
  assert.match(assistant, /MAX_ASSISTANT_REQUEST_LENGTH = 1000/)
  assert.match(assistant, /isMeaningfulAssistantRequest/)
  assert.match(assistant, /normalizeAssistantRequest/)
  assert.match(rpc, /char_length\(cleaned_request\) > 1000/)
  assert.match(rpc, /cleaned_request !~ '\[\[:alnum:\]\]'/)
})

test('permissions and internal tables are protected by RLS/service-only functions', () => {
  assert.match(foundation, /Users can read owned or frame shared watches/)
  assert.match(foundation, /alter table public\.monitoring_queue enable row level security/)
  assert.match(foundation, /revoke execute on function public\.claim_monitoring_queue\(integer,text,integer\) from public, anon, authenticated/)
  assert.match(rpc, /revoke execute on function public\.create_ai_assistant_watch\(text,text\) from public, anon/)
  assert.match(rpc, /grant execute on function public\.create_ai_assistant_watch\(text,text\) to authenticated/)
})
