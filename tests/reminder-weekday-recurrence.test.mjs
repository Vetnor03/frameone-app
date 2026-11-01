import test from 'node:test'
import assert from 'node:assert/strict'
import { firstReminderOccurrenceDate, nextReminderOccurrenceDate, normalizeRepeatWeekdays } from '../app/lib/reminders/recurrence.ts'

test('normalizes selected reminder weekdays to unique ISO weekdays', () => {
  assert.deepEqual(normalizeRepeatWeekdays([5, 1, 3, 3, 9, 0]), [1, 3, 5])
  assert.equal(normalizeRepeatWeekdays([]), null)
})

test('selected-weekday recurrence advances Monday Wednesday Friday correctly', () => {
  const monday = new Date(2026, 10, 2)
  assert.equal(nextReminderOccurrenceDate(monday, 'weekdays', null, [1, 3, 5])?.getDay(), 3)
  const friday = new Date(2026, 10, 6)
  const next = nextReminderOccurrenceDate(friday, 'weekdays', null, [1, 3, 5])
  assert.equal(next?.getFullYear(), 2026)
  assert.equal(next?.getMonth(), 10)
  assert.equal(next?.getDate(), 9)
})

test('weekday recurrence starts on the first allowed weekday on or after its base date', () => {
  const sunday = new Date(2026, 10, 1)
  const first = firstReminderOccurrenceDate(sunday, 'weekdays', [1, 2, 3, 4, 5])
  assert.equal(first?.getDate(), 2)
  assert.equal(first?.getDay(), 1)
})
