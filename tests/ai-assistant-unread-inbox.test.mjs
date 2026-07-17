import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { selectNewestUnreadUpdates } from '../app/lib/aiAssistantUpdates.ts'
import { selectAiAssistantFrameItems } from '../app/lib/device/aiAssistantFrame.ts'

const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')

function update(id, watchId, createdAt, isRead = false) {
  return { id, watch_id: watchId, headline: id, summary: id, created_at: createdAt, is_read: isRead, dismissed_from_frame: false, monitoring_watches: { owner_user_id: 'member' } }
}

test('main inbox selects one newest unread row per Watch and sorts newest first', () => {
  const rows = [
    update('a-old', 'a', '2026-07-17T10:00:00Z'),
    update('b-new', 'b', '2026-07-17T13:00:00Z'),
    update('a-new', 'a', '2026-07-17T12:00:00Z'),
  ]
  assert.deepEqual(selectNewestUnreadUpdates(rows).map((row) => row.id), ['b-new', 'a-new'])
})

test('read newest update suppresses its Watch instead of revealing older unread history', () => {
  const rows = [
    update('new-read', 'watch', '2026-07-17T12:00:00Z', true),
    update('old-unread', 'watch', '2026-07-17T11:00:00Z'),
  ]
  assert.deepEqual(selectNewestUnreadUpdates(rows), [])
  assert.equal(rows.length, 2, 'selection preserves complete stored history')
})

test('a new update supersedes prior history and becomes current normally', () => {
  const rows = [
    update('new', 'watch', '2026-07-17T12:00:00Z'),
    update('old', 'watch', '2026-07-17T11:00:00Z'),
  ]
  assert.deepEqual(selectNewestUnreadUpdates(rows).map((row) => row.id), ['new'])
})

test('frame applies newest-per-Watch before read and 24-hour eligibility filters', () => {
  const now = new Date('2026-07-17T14:00:00Z')
  const readNewest = selectAiAssistantFrameItems([
    update('new-read', 'watch', '2026-07-17T13:00:00Z', true),
    update('old-unread', 'watch', '2026-07-17T12:00:00Z'),
  ], { memberUserIds: ['member'], now, limit: 2 })
  assert.deepEqual(readNewest.items, [])

  const expiredNewest = selectAiAssistantFrameItems([
    update('new-expired', 'watch', '2026-07-16T13:59:59Z'),
    update('older-expired', 'watch', '2026-07-16T12:00:00Z'),
  ], { memberUserIds: ['member'], now, limit: 2 })
  assert.deepEqual(expiredNewest.items, [])
})

test('UI keeps full history while mark-all-read targets only visible inbox IDs', () => {
  assert.doesNotMatch(assistant, /limit\(40\)/)
  assert.match(assistant, /updatesByWatch\[0\]/)
  assert.match(assistant, /updatesByWatch\.slice\(1\)/)
  assert.match(assistant, /const ids = inboxUpdates\.map\(\(u\) => u\.id\)/)
  assert.doesNotMatch(assistant, /delete\(\).*monitoring_updates|from\('monitoring_updates'\)\.delete/)
})
