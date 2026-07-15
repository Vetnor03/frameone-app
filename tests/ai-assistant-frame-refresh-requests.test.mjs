import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const worker = readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts', import.meta.url), 'utf8')
const originalMigration = readFileSync(new URL('../supabase/migrations/20260714235900_ai_assistant_frame_refresh_requests.sql', import.meta.url), 'utf8')
const rollbackMigration = readFileSync(new URL('../supabase/migrations/20260715203000_disable_ai_assistant_frame_refresh_requests.sql', import.meta.url), 'utf8')
const mirrorRoute = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')


test('monitoring worker stores Assistant updates without requesting a physical frame refresh', () => {
  assert.match(worker, /from\('monitoring_updates'\)\.insert\(/)
  assert.doesNotMatch(worker, /requestAssistantFrameRefresh/)
  assert.doesNotMatch(worker, /request_ai_assistant_frame_content_refresh/)
  assert.doesNotMatch(worker, /ai-assistant:frame-refresh-decision/)
})


test('applied migration history is preserved', () => {
  assert.match(originalMigration, /create or replace function public\.request_ai_assistant_frame_content_refresh/)
  assert.match(originalMigration, /create trigger trg_ai_assistant_update_read_state_refresh/)
})


test('forward migration removes the live Assistant refresh trigger and functions safely', () => {
  assert.match(rollbackMigration, /drop trigger if exists trg_ai_assistant_update_read_state_refresh\s+on public\.monitoring_updates;/)
  assert.match(rollbackMigration, /drop function if exists public\.ai_assistant_update_read_state_refresh_trigger\(\);/)
  assert.match(rollbackMigration, /drop function if exists public\.request_ai_assistant_frame_content_refresh\(uuid, text\);/)

  const triggerDrop = rollbackMigration.indexOf('drop trigger if exists')
  const triggerFunctionDrop = rollbackMigration.indexOf('drop function if exists public.ai_assistant_update_read_state_refresh_trigger')
  const refreshFunctionDrop = rollbackMigration.indexOf('drop function if exists public.request_ai_assistant_frame_content_refresh')
  assert.ok(triggerDrop >= 0 && triggerDrop < triggerFunctionDrop)
  assert.ok(triggerFunctionDrop < refreshFunctionDrop)
})


test('Mirror Assistant remains passive and does not request physical refreshes', () => {
  const assistantSection = mirrorRoute.slice(
    mirrorRoute.indexOf('async function aiAssistantDetail'),
    mirrorRoute.indexOf('async function remindersDetail'),
  )
  assert.doesNotMatch(assistantSection, /request_ai_assistant_frame_content_refresh|\/api\/device\/refresh|setInterval|setTimeout/)
})
