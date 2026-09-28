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

test('standard Tomorrow prefix preserves clock order and leaves untimed personal reminders after timed events', () => {
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
  assert.deepEqual(prioritized.slice(0, 4).map((item) => item.reminder_id), [
    'event-1200', 'event-1700', 'event-1800', 'event-1815',
  ])
  assert.equal(prioritized.at(-1).reminder_id, 'personal-all-day')
  assert.equal(prioritized.length, items.length)
})
test('compact Tomorrow prefix does not pull a later personal reminder ahead of earlier events', () => {
  const items = [
    entry('event-1200', '12:00'),
    entry('event-1700', '17:00'),
    entry('event-1800', '18:00'),
    entry('personal-2000', '20:00', 'remind'),
  ]

  const prioritized = prioritizeReminderVisiblePrefix(items, ['compact'])
  assert.deepEqual(prioritized.slice(0, 3).map((item) => item.reminder_id), [
    'event-1200', 'event-1700', 'event-1800',
  ])
  assert.equal(prioritized.at(-1).reminder_id, 'personal-2000')
})
test('future buckets use the three-item renderer capacity in chronological order', () => {
  const items = [
    entry('event-1200', '12:00', 'local-events', 6),
    entry('event-1700', '17:00', 'local-events', 6),
    entry('event-1800', '18:00', 'local-events', 6),
    entry('personal-2000', '20:00', 'remind', 6),
  ]

  const prioritized = prioritizeReminderVisiblePrefix(items, ['standard'])
  assert.deepEqual(prioritized.slice(0, 3).map((item) => item.reminder_id), [
    'event-1200', 'event-1700', 'event-1800',
  ])
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

test('frame orders the photographed day chronologically, with Teams first at the shared start time', () => {
  const entries = [
    entry('public-1200', '12:00'),
    entry('teams-1300', '13:00', 'teams'),
    entry('public-1300', '13:00'),
    entry('public-1700', '17:00'),
    entry('personal-0800', '08:00', 'remind'),
  ]

  const prioritized = prioritizeReminderVisiblePrefix(entries, ['standard'])
  assert.deepEqual(prioritized.map((item) => item.reminder_id), [
    'personal-0800', 'public-1200', 'teams-1300', 'public-1300', 'public-1700',
  ])
  assert.deepEqual(prioritized.slice(0, 4).map((item) => item.reminder_id), [
    'personal-0800', 'public-1200', 'teams-1300', 'public-1300',
  ])
})

test('the limited feed keeps a same-time Teams meeting ahead of later public events', () => {
  const entries = [
    entry('public-1200', '12:00'),
    entry('public-1300', '13:00'),
    entry('teams-1300', '13:00', 'teams'),
    ...Array.from({ length: 12 }, (_, i) => entry(`public-later-${i}`, `${String(14 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)),
  ]
  const selected = prioritizeReminderVisiblePrefix(selectReminderDisplayGroups(entries, 10), ['compact'])
  assert.deepEqual(selected.slice(0, 3).map((item) => item.reminder_id), [
    'public-1200', 'teams-1300', 'public-1300',
  ])
  assert.equal(selected.length, 10)
})

test('an earlier public event stays ahead of a later calendar meeting even when the feed is capped', () => {
  const entries = [
    ...Array.from({ length: 14 }, (_, i) => entry(`public-${i}`, `${String(8 + i).padStart(2, '0')}:00`)),
    entry('teams-2000', '20:00', 'teams'),
  ]
  const selected = prioritizeReminderVisiblePrefix(selectReminderDisplayGroups(entries, 10), ['compact'])
  assert.equal(selected[0].reminder_id, 'public-0')
  assert.equal(selected.some((item) => item.reminder_id === 'teams-2000'), false)
  assert.equal(selected.length, 10)
})

test('calendar meetings retain time order with earlier public events and break only equal-time ties', () => {
  const prioritized = prioritizeReminderVisiblePrefix([
    entry('teams-1700', '17:00', 'teams'),
    entry('spond-1400', '14:00', 'spond'),
    entry('teams-1300', '13:00', 'teams'),
    entry('public-0800', '08:00'),
    entry('public-1400', '14:00'),
    entry('public-1700', '17:00'),
  ], ['standard'])
  assert.deepEqual(prioritized.map((item) => item.reminder_id), [
    'public-0800', 'teams-1300', 'spond-1400', 'public-1400', 'teams-1700', 'public-1700',
  ])
})

test('personal reminders beat Teams and public events only at equal times', () => {
  const items = [
    entry('event-1200', '12:00'),
    entry('teams-1300', '13:00', 'teams'),
    entry('public-1300', '13:00'),
    entry('personal-1300', '13:00', 'remind'),
    entry('personal-1500', '15:00', 'remind'),
    entry('event-1400', '14:00'),
    entry('personal-1100', '11:00', 'remind'),
  ]
  const prioritized = prioritizeReminderVisiblePrefix(items, ['standard'])
  assert.deepEqual(prioritized.map((item) => item.reminder_id), [
    'personal-1100', 'event-1200', 'personal-1300', 'teams-1300',
    'public-1300', 'event-1400', 'personal-1500',
  ])
  assert.deepEqual(prioritized.slice(0, 4).map((item) => item.reminder_id), [
    'personal-1100', 'event-1200', 'personal-1300', 'teams-1300',
  ])
})

test('untimed personal reminders break ties with untimed imported items without jumping ahead of timed events', () => {
  const prioritized = prioritizeReminderVisiblePrefix([
    entry('public-all-day', null),
    entry('personal-all-day', null, 'remind'),
    entry('event-1200', '12:00'),
  ], ['standard'])
  assert.deepEqual(prioritized.map((item) => item.reminder_id), [
    'event-1200', 'personal-all-day', 'public-all-day',
  ])
})
