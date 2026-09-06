import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { selectAiAssistantFrameItems } from '../app/lib/device/aiAssistantFrame.ts'

const frameLoop = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
const statusRoute = readFileSync(new URL('../app/api/device/status/route.ts', import.meta.url), 'utf8')
const refreshRoute = readFileSync(new URL('../app/api/device/refresh/route.ts', import.meta.url), 'utf8')
const selector = readFileSync(new URL('../app/lib/device/aiAssistantFrame.ts', import.meta.url), 'utf8')

function update(id, createdAt, extra = {}) {
  return {
    id,
    watch_id: id,
    headline: `Headline ${id}`,
    summary: `Summary ${id}`,
    is_read: false,
    dismissed_from_frame: false,
    created_at: createdAt,
    monitoring_watches: { owner_user_id: 'member-a' },
    ...extra,
  }
}

const base = {
  memberUserIds: ['member-a'],
  limit: 1,
}

test('AI Assistant rotation never adds an Assistant wake, refresh endpoint call, or dedicated 15-minute timer', () => {
  assert.match(frameLoop, /MAX_REVISION_POLL_SECONDS = 10 \* 60/)
  assert.doesNotMatch(frameLoop, /assistant[\s\S]{0,120}(wake|refresh|timer|900ULL|15\s*min)/i)
  const assistantRouteSection = route.slice(route.indexOf('async function aiAssistantDetail'), route.indexOf('async function remindersDetail'))
  assert.doesNotMatch(assistantRouteSection, /setTimeout|setInterval|\/api\/device\/refresh|forceRefresh/i)
  assert.doesNotMatch(selector, /setTimeout|setInterval|\/api\/device\/refresh|wake/i)
})

test('repeated Mirror snapshot selections in the same physical render cycle are stable and do not use request count', () => {
  const rows = [
    update('newest', '2026-07-14T10:00:00.000Z'),
    update('older', '2026-07-14T09:00:00.000Z'),
  ]
  const first = selectAiAssistantFrameItems(rows, { ...base, renderCycleId: '2026-07-14T11:00:00.000Z' })
  for (let i = 0; i < 10; i += 1) {
    assert.deepEqual(selectAiAssistantFrameItems(rows, { ...base, renderCycleId: '2026-07-14T11:00:00.000Z' }), first)
  }
  assert.doesNotMatch(selector, /requestCount|request_count|\+\+/)
})

test('a later genuine render cycle can advance from the previous selected update', () => {
  const rows = [
    update('newest', '2026-07-14T10:00:00.000Z'),
    update('older', '2026-07-14T09:00:00.000Z'),
  ]
  const next = selectAiAssistantFrameItems(rows, { ...base, renderCycleId: '2026-07-14T15:00:00.000Z', previousSelectedId: 'newest' })
  assert.deepEqual(next.items.map((x) => x.id), ['older'])
})

test('Mirror View is independent from the physical frame durable render marker', () => {
  assert.match(statusRoute, /if \(did_render === true\)[\s\S]*payload\.last_render_at = nowIso/)
  assert.match(route, /last_render_at, last_refresh_at/)
  assert.match(route, /aiAssistantDetail\(supabase, deviceId\)/)
  assert.doesNotMatch(route, /aiAssistantDetail\(supabase, deviceId, statusRow/)
})

test('browser time, Mirror polling time, and newly found updates after last render do not affect selection', () => {
  const rows = [
    update('after-render-new-update', '2026-07-14T12:30:00.000Z'),
    update('selected-at-render', '2026-07-14T11:30:00.000Z'),
  ]
  const selected = selectAiAssistantFrameItems(rows, { ...base, now: new Date('2030-01-01T00:00:00.000Z'), renderCycleId: '2026-07-14T12:00:00.000Z' })
  assert.deepEqual(selected.items.map((x) => x.id), ['selected-at-render'])
  assert.doesNotMatch(selector, /Date\.now\(\)[\s\S]{0,80}%|15 \* 60|900000|browser/i)
})

test('marking read or discovering updates does not force an immediate physical render', () => {
  assert.doesNotMatch(statusRoute, /monitoring_updates[\s\S]{0,200}last_render_at/)
  assert.doesNotMatch(refreshRoute, /monitoring_updates|assistant/i)
  assert.doesNotMatch(route, /monitoring_updates[\s\S]{0,400}last_render_at\s*=/)
})

test('selection safely reconciles on the next normal render when selected item is ineligible', () => {
  const rows = [
    update('read-now', '2026-07-14T10:00:00.000Z', { watch_id: 'same-watch', is_read: true }),
    update('eligible-next', '2026-07-14T09:00:00.000Z', { watch_id: 'same-watch' }),
  ]
  const selected = selectAiAssistantFrameItems(rows, { ...base, renderCycleId: '2026-07-14T12:00:00.000Z', previousSelectedId: 'read-now' })
  assert.deepEqual(selected.items.map((x) => x.id), [])
})
