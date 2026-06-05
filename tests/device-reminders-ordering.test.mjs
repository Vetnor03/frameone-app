import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSpondReminderItems, buildTeamsMeetingItems, compareReminderItems } from '../app/lib/device/remindersFeed.ts'

test('frame reminder feed orders tomorrow Microsoft meeting before later trash reminder', () => {
  const todayYmd = '2026-06-01'
  const horizonEndYmd = '2026-09-29'
  const timeZone = 'Europe/Oslo'
  const now = new Date('2026-06-01T18:00:00.000Z')

  const teamsItems = buildTeamsMeetingItems([
    {
      id: 'integration-row-1',
      user_id: 'user-1',
      provider: 'teams',
      external_id: 'meeting-tomorrow-0800',
      title: 'Tomorrow morning meeting',
      body: null,
      starts_at: '2026-06-02T06:00:00.000Z',
      due_at: '2026-06-02T07:00:00.000Z',
      priority: 0,
    },
  ], todayYmd, horizonEndYmd, timeZone, now)

  const trashReminder = {
    reminder_id: 'trash-tuesday',
    title: 'Tøm plast, Tøm restavfall',
    occurrence_date: '2026-06-09',
    display_date: '09.06.2026',
    days_until: 8,
    is_overdue: false,
    repeat: 'none',
    due_time: null,
    display_time: null,
    source: 'remind',
  }

  const items = [...teamsItems, trashReminder].sort(compareReminderItems)

  assert.equal(teamsItems.length, 1)
  assert.equal(teamsItems[0].display_date, 'Tomorrow')
  assert.equal(teamsItems[0].display_time, '08:00')
  assert.equal(items[0].title, 'Tomorrow morning meeting')
  assert.equal(items[1].title, 'Tøm plast, Tøm restavfall')
})

test('Spond reminder feed only includes event arrangements', () => {
  const items = buildSpondReminderItems([
    {
      id: 'spond-event-row',
      user_id: 'user-1',
      provider: 'spond',
      external_id: 'event:arrangement-1',
      title: 'Practice',
      body: null,
      starts_at: '2026-06-02T16:00:00.000Z',
      due_at: '2026-06-02T17:00:00.000Z',
      priority: 0,
    },
    {
      id: 'spond-post-row',
      user_id: 'user-1',
      provider: 'spond',
      external_id: 'post:announcement-1',
      title: 'Updated announcement',
      body: null,
      starts_at: '2026-06-01T08:00:00.000Z',
      due_at: '2026-06-01T08:00:00.000Z',
      priority: 10,
    },
    {
      id: 'spond-chat-row',
      user_id: 'user-1',
      provider: 'spond',
      external_id: 'chat:comment-thread-1',
      title: 'Latest comment',
      body: null,
      starts_at: '2026-06-01T09:00:00.000Z',
      due_at: '2026-06-01T09:00:00.000Z',
      priority: 20,
    },
  ], '2026-06-01', '2026-06-30', 'Europe/Oslo', false)

  assert.equal(items.length, 1)
  assert.equal(items[0].external_id, 'event:arrangement-1')
  assert.equal(items[0].title, 'Practice')
})
