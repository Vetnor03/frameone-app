import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTeamsMeetingItems, compareReminderItems } from '../app/lib/device/remindersFeed.ts'

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
