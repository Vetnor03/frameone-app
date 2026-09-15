import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import { sortReminderItems } from '../app/lib/device/remindersFeed.ts'

const source = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
const occurrenceBuilder = source.slice(source.indexOf('function buildOccurrencesForRow('), source.indexOf('export async function GET('))

test('manual reminder uses end time as effective display time when start time is missing', () => {
  assert.match(occurrenceBuilder, /const dueTime = normalizeReminderTime\(row\.due_time\)/)
  assert.match(occurrenceBuilder, /const endTime = normalizeReminderTime\(row\.end_time\)/)
  assert.match(occurrenceBuilder, /const effectiveTime = dueTime \|\| endTime/)
  assert.match(occurrenceBuilder, /due_time: effectiveTime/)
  assert.match(occurrenceBuilder, /display_time: effectiveTime/)
})

test('effective 08:00 reminder sorts before later imported events', () => {
  const items = [
    {
      reminder_id: 'local-event-12', title: 'Imported noon event', occurrence_date: '2026-09-15',
      display_date: 'Today', days_until: 0, is_overdue: false, repeat: 'none',
      due_time: '12:00', display_time: '12:00', source: 'local-events',
    },
    {
      reminder_id: 'manual-08', title: 'Manual end-time reminder', occurrence_date: '2026-09-15',
      display_date: 'Today', days_until: 0, is_overdue: false, repeat: 'none',
      due_time: '08:00', display_time: '08:00', source: 'remind', is_user_created: true,
    },
  ]

  assert.deepEqual(sortReminderItems(items).map(item => item.reminder_id), ['manual-08', 'local-event-12'])
})
