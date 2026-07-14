import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { selectAiAssistantFrameItems } from '../app/lib/device/aiAssistantFrame.ts'

const worker = readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260714235900_ai_assistant_frame_refresh_requests.sql', import.meta.url), 'utf8')
const mirrorRoute = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
const frameLoop = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')

function update(id, createdAt, extra = {}) {
  return { id, headline: `Headline ${id}`, summary: `Summary ${id}`, is_read: false, dismissed_from_frame: false, created_at: createdAt, monitoring_watches: { owner_user_id: 'member-a' }, ...extra }
}

const base = { memberUserIds: ['member-a'], limit: 1 }

test('new inserted monitoring update requests existing frame content refresh', () => {
  assert.match(worker, /monitoring_updates'\)\.insert\([\s\S]*\.select\('id'\)\.single\(\)/)
  assert.match(worker, /createdUpdate = true[\s\S]*requestAssistantFrameRefresh\(supabase, watch, 'new_update'/)
  assert.match(migration, /update public\.device_settings ds\s+set updated_at = now\(\)/)
  assert.match(migration, /jsonb_array_elements\(coalesce\(ds\.settings_json->'cells'/)
})

test('no_change, duplicate, uncertain, failed, and last_checked-only paths do not request a new refresh', () => {
  assert.match(worker, /status === 'no_change'\) await requestAssistantFrameRefresh\(supabase, watch, 'no_change'\)/)
  assert.match(worker, /includes\('23505'\)\) \{\s*await requestAssistantFrameRefresh\(supabase, watch, 'duplicate'\)/)
  assert.doesNotMatch(worker, /requestAssistantFrameRefresh\(supabase, watch, 'uncertain'/)
  assert.doesNotMatch(worker, /requestAssistantFrameRefresh\(supabase, watch, 'error'/)
  assert.match(worker, /last_checked_at: new Date\(\)\.toISOString\(\)/)
})

test('pending frame refreshes coalesce per relevant configured frame', () => {
  assert.match(migration, /ds\.updated_at > coalesce\(st\.last_render_at, st\.last_refresh_at/)
  assert.match(migration, /'reused_pending_request', true/)
  assert.match(migration, /where w\.id = p_watch_id[\s\S]*w\.show_on_frame = true[\s\S]*w\.frame_id is not null/)
})

test('read-state changes request existing content-change update with coalescing', () => {
  assert.match(migration, /after update of is_read, dismissed_from_frame on public\.monitoring_updates/)
  assert.match(migration, /request_ai_assistant_frame_content_refresh\(new\.watch_id, 'read_state_changed'\)/)
})

test('rotation and repeated Mirror snapshots do not request refresh or advance selection', () => {
  const rows = [update('newest', '2026-07-14T10:00:00.000Z'), update('older', '2026-07-14T09:00:00.000Z')]
  const first = selectAiAssistantFrameItems(rows, { ...base, renderCycleId: '2026-07-14T11:00:00.000Z' })
  assert.deepEqual(selectAiAssistantFrameItems(rows, { ...base, renderCycleId: '2026-07-14T11:00:00.000Z' }), first)
  const assistantRouteSection = mirrorRoute.slice(mirrorRoute.indexOf('async function aiAssistantDetail'), mirrorRoute.indexOf('async function remindersDetail'))
  assert.doesNotMatch(assistantRouteSection, /request_ai_assistant_frame_content_refresh|\/api\/device\/refresh|setInterval|setTimeout|requestCount|request_count/)
})

test('new update render prioritizes newest eligible item and remaining updates do not request another refresh', () => {
  const selected = selectAiAssistantFrameItems([update('older', '2026-07-14T09:00:00.000Z'), update('newest', '2026-07-14T10:00:00.000Z')], { ...base, renderCycleId: '2026-07-14T11:00:00.000Z' })
  assert.deepEqual(selected.items.map((x) => x.id), ['newest'])
  assert.doesNotMatch(readFileSync(new URL('../app/lib/device/aiAssistantFrame.ts', import.meta.url), 'utf8'), /request_ai_assistant_frame_content_refresh|\/api\/device\/refresh/)
})

test('unrelated frames are not refreshed and Mirror/physical use same selected server item', () => {
  assert.match(migration, /ds\.device_id = target_frame_id/)
  assert.doesNotMatch(migration, /owner_user_id[\s\S]{0,120}device_settings/)
  assert.match(mirrorRoute, /selectAiAssistantFrameItems\([\s\S]*renderCycleId/)
})

test('no Assistant-specific timer or wake schedule exists', () => {
  assert.match(frameLoop, /static const uint64_t QUICK_WAKE_US = 900ULL \* 1000000ULL/)
  assert.match(frameLoop, /static const uint16_t WAKES_PER_REFRESH = 12/)
  assert.doesNotMatch(frameLoop, /assistant[\s\S]{0,120}(wake|refresh|timer|900ULL|15\s*min)/i)
})

test('refresh decisions log only non-sensitive structured fields', () => {
  assert.match(worker, /\[ai-assistant:frame-refresh-decision\]/)
  for (const secret of ['headline', 'summary', 'original_request', 'search_guidance', 'source_urls']) {
    const logLines = worker.split('\n').filter((line) => line.includes('[ai-assistant:frame-refresh-decision]')).join('\n')
    assert.doesNotMatch(logLines, new RegExp(secret))
  }
})
