import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLocalEventFrameItem, compareReminderItems } from '../app/lib/device/remindersFeed.ts'

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

test('Local Events frame selection returns at most one nearest future timed event', () => {
  const items = buildLocalEventFrameItem([
    row('later', 'Later', '2026-07-12T18:00:00+02:00'),
    row('first', 'First', '2026-07-12T17:00:00+02:00'),
  ], [], today, at('2026-07-12T14:00:00Z'))
  assert.equal(items.length, 1)
  assert.equal(items[0].external_id, 'first')
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

test('all-day Local Events are eligible only on the Oslo event date and expire after midnight', () => {
  const allDay = row('all', 'All Day', null, { date: '2026-07-12', all_day: true })
  assert.equal(buildLocalEventFrameItem([allDay], [], '2026-07-11', at('2026-07-11T21:59:00Z')).length, 0)
  assert.equal(buildLocalEventFrameItem([allDay], [], '2026-07-12', at('2026-07-11T22:00:00Z')).length, 1)
  assert.equal(buildLocalEventFrameItem([allDay], [], '2026-07-13', at('2026-07-12T22:00:00Z')).length, 0)
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
  const local = buildLocalEventFrameItem([row('a', 'Alpha', '2026-07-12T17:00:00+02:00')], [], today, at('2026-07-12T14:00:00Z'))
  const manual = { reminder_id: 'm1', title: 'Manual', occurrence_date: today, display_date: 'Today', days_until: 0, is_overdue: false, repeat: 'none', due_time: '16:00', display_time: '16:00', source: 'remind' }
  const sorted = [local[0], manual].sort(compareReminderItems)
  assert.equal(sorted.length, 2)
  assert.deepEqual(Object.keys({ items: sorted }), ['items'])
})
