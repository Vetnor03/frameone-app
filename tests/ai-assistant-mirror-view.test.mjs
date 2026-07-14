import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { selectAiAssistantFrameItems, AI_ASSISTANT_FRAME_LIMITS } from '../app/lib/device/aiAssistantFrame.ts'

const route = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260714190000_add_ai_assistant_frame_visibility_rpc.sql', import.meta.url), 'utf8')

function row(id, hoursAgo, extra = {}) {
  const now = new Date('2026-07-14T12:00:00.000Z')
  return {
    id,
    headline: `Headline ${id}`,
    summary: `Summary ${id}`,
    source_urls: ['https://example.com/source'],
    is_read: false,
    dismissed_from_frame: false,
    created_at: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString(),
    monitoring_watches: { frame_id: 'frame-a', show_on_frame: true },
    ...extra,
  }
}

test('AI Assistant mirror empty state supports Norwegian and English copy', () => {
  assert.match(home, /function mirrorAiAssistantEmptyMessage/)
  assert.match(home, /Ingen nye oppdateringer/)
  assert.match(home, /No new updates/)
  assert.match(home, /function mirrorAiAssistantHeader\(\) \{\n  return 'AI Assistant'/)
})

test('AI Assistant frame selector expires updates at the 24-hour boundary and sorts newest first', () => {
  const selected = selectAiAssistantFrameItems([row('old', 24), row('newer', 1), row('newest', 0.5)], { frameId: 'frame-a', now: new Date('2026-07-14T12:00:00.000Z'), limit: 8 })
  assert.deepEqual(selected.items.map((x) => x.id), ['newest', 'newer'])
  assert.equal(selected.overflowCount, 0)
})

test('AI Assistant frame selector applies size limits and overflow counts', () => {
  const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => row(String(n), n + 0.1))
  assert.equal(AI_ASSISTANT_FRAME_LIMITS.small, 3)
  assert.equal(selectAiAssistantFrameItems(rows, { frameId: 'frame-a', now: new Date('2026-07-14T12:00:00.000Z'), limit: AI_ASSISTANT_FRAME_LIMITS.small }).items.length, 3)
  assert.equal(selectAiAssistantFrameItems(rows, { frameId: 'frame-a', now: new Date('2026-07-14T12:00:00.000Z'), limit: AI_ASSISTANT_FRAME_LIMITS.small }).overflowCount, 6)
  assert.equal(selectAiAssistantFrameItems(rows, { frameId: 'frame-a', now: new Date('2026-07-14T12:00:00.000Z'), limit: AI_ASSISTANT_FRAME_LIMITS.medium }).items.length, 4)
  assert.equal(selectAiAssistantFrameItems(rows, { frameId: 'frame-a', now: new Date('2026-07-14T12:00:00.000Z'), limit: AI_ASSISTANT_FRAME_LIMITS.large }).items.length, 6)
  assert.equal(selectAiAssistantFrameItems(rows, { frameId: 'frame-a', now: new Date('2026-07-14T12:00:00.000Z'), limit: AI_ASSISTANT_FRAME_LIMITS.full }).items.length, 8)
})

test('AI Assistant frame selector excludes dismissed, hidden, and other-frame updates but keeps read and shared-frame updates visible', () => {
  const selected = selectAiAssistantFrameItems([
    row('dismissed', 1, { dismissed_from_frame: true }),
    row('hidden-watch', 1, { monitoring_watches: { frame_id: 'frame-a', show_on_frame: false } }),
    row('other-frame', 1, { monitoring_watches: { frame_id: 'frame-b', show_on_frame: true } }),
    row('read-visible', 1, { is_read: true }),
    row('shared-authorized', 2, { monitoring_watches: { frame_id: 'frame-a', show_on_frame: true } }),
  ], { frameId: 'frame-a', now: new Date('2026-07-14T12:00:00.000Z'), limit: 8 })
  assert.deepEqual(selected.items.map((x) => x.id), ['read-visible', 'shared-authorized'])
})

test('AI Assistant mirror snapshot filters server-side by watch/frame visibility fields', () => {
  assert.match(route, /from\('monitoring_updates'\)/)
  assert.match(route, /monitoring_watches!inner\(frame_id, show_on_frame\)/)
  assert.match(route, /eq\('monitoring_watches\.frame_id', frameId\)/)
  assert.match(route, /eq\('monitoring_watches\.show_on_frame', true\)/)
  assert.match(route, /eq\('dismissed_from_frame', false\)/)
  assert.match(route, /gt\('created_at', sinceIso\)/)
  assert.doesNotMatch(route, /eq\('is_read'/)
})

test('AI Assistant mirror renderer only uses headlines, not summary or source text', () => {
  const renderer = home.slice(home.indexOf('function mirrorAiAssistantHeader'), home.indexOf('function MirrorLargeRemindersCard'))
  assert.match(renderer, /headline/)
  assert.doesNotMatch(renderer, /summary|source_urls|source URL|confidence|timestamp|button/i)
})

test('AI Assistant is selectable and edit flow can explicitly show a watch on the selected frame', () => {
  assert.match(home, /const prominentOption: ModuleKey = 'assistant'/)
  assert.match(assistant, /showOnFrame: 'Show on frame'/)
  assert.match(assistant, /showOnFrame: 'Vis på frame'/)
  assert.match(assistant, /set_ai_assistant_watch_frame_visibility/)
  assert.match(migration, /p_frame_id is not null and not exists \(select 1 from public\.device_members/)
})
