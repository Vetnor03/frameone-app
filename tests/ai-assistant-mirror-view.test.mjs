import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { selectAiAssistantFrameItems, AI_ASSISTANT_FRAME_LIMITS } from '../app/lib/device/aiAssistantFrame.ts'

const route = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')

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
    monitoring_watches: { owner_user_id: 'member-a', frame_id: null, show_on_frame: false },
    ...extra,
  }
}

const options = { memberUserIds: ['member-a', 'member-b'], now: new Date('2026-07-14T12:00:00.000Z'), limit: 8 }

test('AI Assistant manual Show on frame control is removed from the app tab', () => {
  assert.doesNotMatch(assistant, /Show on frame|Vis på frame|showOnFrame|setWatchFrameVisibility|set_ai_assistant_watch_frame_visibility/)
  assert.doesNotMatch(assistant, /show_' \+ 'on_frame|monitoring_watches\(title\)/)
  assert.match(assistant, /finally \{\n      setLoading\(false\)/)
  assert.match(assistant, /Retry/)
})

test('AI Assistant mirror empty state supports Norwegian and English copy', () => {
  assert.match(home, /function mirrorAiAssistantEmptyMessage/)
  assert.match(home, /Ingen nye oppdateringer/)
  assert.match(home, /No new updates/)
  assert.match(home, /function mirrorAiAssistantHeader\(\) \{\n  return 'AI Assistant'/)
})

test('AI Assistant frame selector ignores show_on_frame and frame_id but enforces membership', () => {
  const selected = selectAiAssistantFrameItems([
    row('show-false-frame-null', 1, { monitoring_watches: { owner_user_id: 'member-a', frame_id: null, show_on_frame: false } }),
    row('show-true-other-frame', 2, { monitoring_watches: { owner_user_id: 'member-b', frame_id: 'frame-b', show_on_frame: true } }),
    row('unrelated-user', 0.5, { monitoring_watches: { owner_user_id: 'stranger', frame_id: null, show_on_frame: true } }),
  ], options)
  assert.deepEqual(selected.items.map((x) => x.id), ['show-false-frame-null', 'show-true-other-frame'])
})

test('AI Assistant frame selector expires updates at the 24-hour boundary and sorts newest first', () => {
  const selected = selectAiAssistantFrameItems([row('old', 24), row('newer', 1), row('newest', 0.5)], options)
  assert.deepEqual(selected.items.map((x) => x.id), ['newest', 'newer'])
  assert.equal(selected.overflowCount, 0)
})

test('AI Assistant frame selector applies size limits and overflow counts', () => {
  const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => row(String(n), n + 0.1))
  assert.equal(AI_ASSISTANT_FRAME_LIMITS.small, 3)
  assert.equal(selectAiAssistantFrameItems(rows, { ...options, limit: AI_ASSISTANT_FRAME_LIMITS.small }).items.length, 3)
  assert.equal(selectAiAssistantFrameItems(rows, { ...options, limit: AI_ASSISTANT_FRAME_LIMITS.small }).overflowCount, 6)
  assert.equal(selectAiAssistantFrameItems(rows, { ...options, limit: AI_ASSISTANT_FRAME_LIMITS.medium }).items.length, 4)
  assert.equal(selectAiAssistantFrameItems(rows, { ...options, limit: AI_ASSISTANT_FRAME_LIMITS.large }).items.length, 6)
  assert.equal(selectAiAssistantFrameItems(rows, { ...options, limit: AI_ASSISTANT_FRAME_LIMITS.full }).items.length, 8)
})

test('AI Assistant frame selector excludes dismissed, keeps read, and includes shared-frame members', () => {
  const selected = selectAiAssistantFrameItems([
    row('dismissed', 1, { dismissed_from_frame: true }),
    row('read-visible', 1, { is_read: true }),
    row('shared-authorized', 2, { monitoring_watches: { owner_user_id: 'member-b', frame_id: null, show_on_frame: false } }),
  ], options)
  assert.deepEqual(selected.items.map((x) => x.id), ['read-visible', 'shared-authorized'])
})

test('AI Assistant zero updates returns structured empty snapshot data and server errors do not hang', () => {
  const selected = selectAiAssistantFrameItems([], options)
  assert.deepEqual(selected, { items: [], overflowCount: 0 })
  assert.match(route, /aiAssistantItems: \[\]/)
  assert.match(route, /aiAssistantOverflowCount: 0/)
  assert.match(route, /\[mirror-snapshot:ai-assistant-failed\]/)
  assert.match(route, /return empty/)
})

test('AI Assistant mirror snapshot uses device members instead of watch frame visibility fields', () => {
  assert.match(route, /from\('device_members'\)/)
  assert.match(route, /select\('user_id'\)/)
  assert.match(route, /monitoring_watches!inner\(owner_user_id\)/)
  assert.match(route, /in\('monitoring_watches\.owner_user_id', memberUserIds\)/)
  assert.doesNotMatch(route, /eq\('monitoring_watches\.frame_id'/)
  assert.doesNotMatch(route, /eq\('monitoring_watches\.show_on_frame'/)
  assert.doesNotMatch(route, /eq\('is_read'/)
  assert.match(route, /eq\('dismissed_from_frame', false\)/)
  assert.match(route, /gt\('created_at', sinceIso\)/)
})

test('AI Assistant mirror renderer only uses headlines, not summary or source text', () => {
  const renderer = home.slice(home.indexOf('function mirrorAiAssistantHeader'), home.indexOf('function MirrorLargeRemindersCard'))
  assert.match(renderer, /headline/)
  assert.doesNotMatch(renderer, /summary|source_urls|source URL|confidence|timestamp|button/i)
})
