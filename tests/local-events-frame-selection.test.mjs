import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLocalEventFrameItem, compareReminderItems, selectReminderDisplayGroups } from '../app/lib/device/remindersFeed.ts'

const provider = 'edge-of-norway'
const today = '2026-07-12'
const at = (iso) => new Date(iso)
const row = (id, title, starts_at, raw = {}) => ({
  id,
  user_id: 'u1',
  provider,
  external_id: id,
  title,
  body: null,
  starts_at,
  due_at: starts_at,
  priority: null,
  raw,
})
const skip = (external_event_id, device_id = 'frame-a') => ({ device_id, provider, external_event_id, skipped: true })

test('Local Events frame selection returns every eligible event in deterministic order', () => {
  const items = buildLocalEventFrameItem([
    row('later', 'Later', '2026-07-12T18:00:00+02:00'),
    row('first', 'First', '2026-07-12T17:00:00+02:00'),
  ], [], today, at('2026-07-12T14:00:00Z'))
  assert.equal(items.length, 2)
  assert.equal(items[0].external_id, 'first')
  assert.equal(items[1].external_id, 'later')
})

test('Local Events use only the content budget left after personal reminders', () => {
  const personal = [
    { reminder_id: 'p1', title: 'Personal today', occurrence_date: today, display_date: 'Today', days_until: 0, is_overdue: false, repeat: 'none', due_time: '19:00', display_time: '19:00', source: 'remind' },
    { reminder_id: 'p2', title: 'Personal tomorrow', occurrence_date: '2026-07-13', display_date: 'Tomorrow', days_until: 1, is_overdue: false, repeat: 'none', due_time: null, display_time: null, source: 'remind' },
  ]
  const local = buildLocalEventFrameItem([
    row('early', 'Local before personal', '2026-07-12T17:00:00+02:00'),
    row('later', 'Local after personal', '2026-07-13T17:00:00+02:00'),
  ], [], today, at('2026-07-12T14:00:00Z'))
  assert.deepEqual(selectReminderDisplayGroups([...local, ...personal].sort(compareReminderItems), 2).map((item) => item.reminder_id), ['p1', 'p2'])
  assert.equal(selectReminderDisplayGroups(local, 2).length, 2)
})

test('date groups are chosen before source priority so Local Events today remain renderable', () => {
  const localToday = buildLocalEventFrameItem([
    row('today-local', 'Local Event Today', '2026-07-12T18:00:00+02:00'),
  ], [], today, at('2026-07-12T14:00:00Z'))
  const personal = [
    { reminder_id: 'tomorrow', title: 'Personal tomorrow', occurrence_date: '2026-07-13', display_date: 'Tomorrow', days_until: 1, is_overdue: false, repeat: 'none', due_time: null, display_time: null, source: 'remind' },
    { reminder_id: 'later-1', title: 'Personal later', occurrence_date: '2026-07-14', display_date: '14.07.2026', days_until: 2, is_overdue: false, repeat: 'none', due_time: null, display_time: null, source: 'remind' },
    { reminder_id: 'later-2', title: 'Personal much later', occurrence_date: '2026-07-15', display_date: '15.07.2026', days_until: 3, is_overdue: false, repeat: 'none', due_time: null, display_time: null, source: 'remind' },
  ]
  const selected = selectReminderDisplayGroups([...personal, ...localToday], 6)
  assert.deepEqual(new Set(selected.map((item) => item.occurrence_date)), new Set([today, '2026-07-13']))
  assert.ok(selected.some((item) => item.reminder_id === 'local-events:today-local'))
  assert.ok(selected.some((item) => item.reminder_id === 'tomorrow'))
})

test('timed Local Event several days in the future is eligible without same-day or lead-time filters', () => {
  const items = buildLocalEventFrameItem([
    row('far', 'Future Festival', '2026-07-20T17:00:00+02:00'),
  ], [], today, at('2026-07-12T14:00:00Z'))
  assert.equal(items.length, 1)
  assert.equal(items[0].external_id, 'far')
  assert.equal(items[0].occurrence_date, '2026-07-20')
})

test('Local Event becomes next in line when no earlier reminder exists', () => {
  const local = buildLocalEventFrameItem([row('sat', 'Saturday Local Event', '2026-07-18T17:00:00+02:00')], [], today, at('2026-07-12T14:00:00Z'))
  const laterManual = { reminder_id: 'm1', title: 'Later Manual', occurrence_date: '2026-07-19', display_date: '19.07.2026', days_until: 7, is_overdue: false, repeat: 'none', due_time: null, display_time: null, source: 'remind' }
  const sorted = [laterManual, local[0]].sort(compareReminderItems)
  assert.equal(sorted[0].title, 'Saturday Local Event')
  assert.equal(sorted[1].title, 'Later Manual')
})

test('timed Local Event disappears exactly at its start time', () => {
  assert.equal(buildLocalEventFrameItem([row('a', 'A', '2026-07-12T17:00:00+02:00')], [], today, at('2026-07-12T14:59:59Z')).length, 1)
  assert.equal(buildLocalEventFrameItem([row('a', 'A', '2026-07-12T17:00:00+02:00')], [], today, at('2026-07-12T15:00:00Z')).length, 0)
})

test('equal-time Local Events sort by normalized title and skipping reveals the next', () => {
  const rows = [row('b', ' zebra', '2026-07-12T17:00:00+02:00'), row('a', 'Alpha', '2026-07-12T17:00:00+02:00')]
  assert.equal(buildLocalEventFrameItem(rows, [], today, at('2026-07-12T14:00:00Z'))[0].external_id, 'a')
  assert.equal(buildLocalEventFrameItem(rows, [skip('a')], today, at('2026-07-12T14:00:00Z'))[0].external_id, 'b')
  assert.equal(buildLocalEventFrameItem(rows, [], today, at('2026-07-12T15:00:00Z')).length, 0)
})

test('future all-day Local Event is eligible before its event date and expires after Oslo midnight next day', () => {
  const allDay = row('all', 'All Day', null, { date: '2026-07-15', all_day: true })
  assert.equal(buildLocalEventFrameItem([allDay], [], today, at('2026-07-12T12:00:00Z'))[0].external_id, 'all')
  assert.equal(buildLocalEventFrameItem([allDay], [], '2026-07-15', at('2026-07-15T21:59:00Z')).length, 1)
  assert.equal(buildLocalEventFrameItem([allDay], [], '2026-07-16', at('2026-07-15T22:00:00Z')).length, 0)
})

test('future timed event on current date takes priority over all-day until it starts', () => {
  const rows = [row('all', 'All Day', null, { date: today, all_day: true }), row('timed', 'Timed', '2026-07-12T17:00:00+02:00')]
  assert.equal(buildLocalEventFrameItem(rows, [], today, at('2026-07-12T14:00:00Z'))[0].external_id, 'timed')
  assert.equal(buildLocalEventFrameItem(rows, [], today, at('2026-07-12T15:00:00Z'))[0].external_id, 'all')
})

test('multiple all-day Local Events sort deterministically and unskipping restores eligibility', () => {
  const rows = [row('b', 'Beta', null, { date: today, all_day: true }), row('a', 'alpha', null, { date: today, all_day: true })]
  assert.equal(buildLocalEventFrameItem(rows, [], today, at('2026-07-12T16:00:00Z'))[0].external_id, 'a')
  assert.equal(buildLocalEventFrameItem(rows, [skip('a')], today, at('2026-07-12T16:00:00Z'))[0].external_id, 'b')
  assert.equal(buildLocalEventFrameItem(rows, [], today, at('2026-07-12T16:00:00Z'))[0].external_id, 'a')
})

test('skip state is frame scoped by caller-provided skip rows', () => {
  const rows = [row('a', 'Alpha', '2026-07-12T17:00:00+02:00'), row('b', 'Beta', '2026-07-12T18:00:00+02:00')]
  assert.equal(buildLocalEventFrameItem(rows, [skip('a', 'frame-a')], today, at('2026-07-12T14:00:00Z'))[0].external_id, 'b')
  assert.equal(buildLocalEventFrameItem(rows, [], today, at('2026-07-12T14:00:00Z'))[0].external_id, 'a')
})

test('Local Events sort as one integration without breaking other providers', () => {
  const local = buildLocalEventFrameItem([row('a', 'Saturday Local Event', '2026-07-18T17:00:00+02:00')], [], today, at('2026-07-12T14:00:00Z'))
  const manual = { reminder_id: 'm1', title: 'Thursday Manual', occurrence_date: '2026-07-16', display_date: '16.07.2026', days_until: 4, is_overdue: false, repeat: 'none', due_time: '16:00', display_time: '16:00', source: 'remind' }
  const sorted = [local[0], manual].sort(compareReminderItems)
  assert.equal(sorted.length, 2)
  assert.equal(sorted[0].title, 'Thursday Manual')
  assert.equal(sorted[1].title, 'Saturday Local Event')
  assert.deepEqual(Object.keys({ items: sorted }), ['items'])
})

test('app-facing Local Events frame item still keeps raw metadata before the physical route compacts it', () => {
  const items = buildLocalEventFrameItem([
    row('raw-event', 'Raw Event', null, { date: '2026-07-15', all_day: true, areaKeys: ['oslo'], private_nested: { keep: true } }),
  ], [], today, at('2026-07-12T12:00:00Z'))
  assert.equal(items.length, 1)
  assert.equal(items[0].source, 'local-events')
  assert.equal(items[0].provider, provider)
  assert.equal(items[0].external_id, 'raw-event')
  assert.deepEqual(items[0].raw, { date: '2026-07-15', all_day: true, areaKeys: ['oslo'], private_nested: { keep: true } })
})
