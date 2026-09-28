import assert from 'node:assert/strict'
import test from 'node:test'

import { prioritizeReminderVisiblePrefix, selectReminderDisplayGroups } from '../app/lib/device/remindersFeed.ts'

function entry(id, time, source = 'local-events', days = 1) {
  return {
    reminder_id: id,
    title: id,
    occurrence_date: days === 1 ? '2026-09-15' : '2026-09-20',
    display_date: days === 1 ? 'Tomorrow' : '20.09.2026',
    days_until: days,
    is_overdue: false,
    repeat: 'none',
    due_time: time,
    display_time: time,
    source,
    is_user_created: source === 'remind',
  }
}

test('standard Tomorrow prefix reserves one of four visible slots for a personal reminder', () => {
  const items = [
    entry('event-1200', '12:00'),
    entry('event-1700', '17:00'),
    entry('event-1800', '18:00'),
    entry('event-1815', '18:15'),
    entry('event-1900', '19:00'),
    entry('event-1930', '19:30'),
    entry('personal-all-day', null, 'remind'),
  ]

  const prioritized = prioritizeReminderVisiblePrefix(items, ['standard'])
  const visible = prioritized.slice(0, 4)

  assert.equal(visible.some((item) => item.reminder_id === 'personal-all-day'), true)
  assert.deepEqual(visible.map((item) => item.reminder_id), [
    'personal-all-day', 'event-1200', 'event-1700', 'event-1800',
  ])
  assert.equal(prioritized.length, items.length)
})

test('compact Tomorrow prefix reserves one of three visible slots for a personal reminder', () => {
  const items = [
    entry('event-1200', '12:00'),
    entry('event-1700', '17:00'),
    entry('event-1800', '18:00'),
    entry('personal-2000', '20:00', 'remind'),
  ]

  const prioritized = prioritizeReminderVisiblePrefix(items, ['compact'])
  assert.deepEqual(prioritized.slice(0, 3).map((item) => item.reminder_id), [
    'personal-2000', 'event-1200', 'event-1700',
  ])
})

test('future buckets use the three-item renderer capacity', () => {
  const items = [
    entry('event-1200', '12:00', 'local-events', 6),
    entry('event-1700', '17:00', 'local-events', 6),
    entry('event-1800', '18:00', 'local-events', 6),
    entry('personal-2000', '20:00', 'remind', 6),
  ]

  const prioritized = prioritizeReminderVisiblePrefix(items, ['standard'])
  assert.equal(prioritized.slice(0, 3).some((item) => item.reminder_id === 'personal-2000'), true)
})

test('groups without personal reminders keep canonical chronological order', () => {
  const items = [
    entry('event-1800', '18:00'),
    entry('event-1200', '12:00'),
    entry('event-1700', '17:00'),
  ]

  const prioritized = prioritizeReminderVisiblePrefix(items, ['standard'])
  assert.deepEqual(prioritized.map((item) => item.reminder_id), ['event-1200', 'event-1700', 'event-1800'])
})

test('connected Teams meeting is visible ahead of optional public events on a crowded day', () => {
  const entries = [
    entry('public-1200', '12:00'),
    entry('teams-1300', '13:00', 'teams'),
    entry('public-1300', '13:00'),
    entry('public-1700', '17:00'),
    entry('personal-0800', '08:00', 'remind'),
  ]

  // The actual production failure: Teams was third, while compact layouts can
  // fit only a prefix. Keep the personal reminder first, then the meeting.
  const prioritized = prioritizeReminderVisiblePrefix(entries, ['compact'])
  assert.deepEqual(prioritized.slice(0, 2).map((item) => item.reminder_id), [
    'personal-0800', 'teams-1300',
  ])
  assert.equal(prioritized.length, entries.length)
})

test('connected calendar commitments outrank public events even when a limited feed is capped', () => {
  const entries = [
    ...Array.from({ length: 14 }, (_, i) => entry(`public-${i}`, `${String(8 + i).padStart(2, '0')}:00`)),
    entry('teams-1700', '17:00', 'teams'),
  ]
  const selected = prioritizeReminderVisiblePrefix(selectReminderDisplayGroups(entries, 10), ['compact'])
  assert.equal(selected[0].reminder_id, 'teams-1700')
  assert.equal(selected.length, 10)
})

test('calendar meetings retain time order within their priority group', () => {
  const prioritized = prioritizeReminderVisiblePrefix([
    entry('teams-1700', '17:00', 'teams'),
    entry('spond-1400', '14:00', 'spond'),
    entry('teams-1300', '13:00', 'teams'),
    entry('public-0800', '08:00'),
  ], ['standard'])
  assert.deepEqual(prioritized.map((item) => item.reminder_id), [
    'teams-1300', 'spond-1400', 'teams-1700', 'public-0800',
  ])
})
