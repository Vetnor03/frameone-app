import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLocalEventItems, compareReminderItems } from '../app/lib/device/remindersFeed.ts'

test('local events appear as upcoming reminder items with location in title', () => {
  const items = buildLocalEventItems([
    { id: '1', user_id: 'u1', provider: 'local_events', external_id: 'edge-of-norway:1', title: 'Gladmatfestivalen · Vågen', body: null, starts_at: '2026-07-12T12:00:00+02:00', due_at: null, priority: 8, raw: { source: 'local_events', type: 'local_event' } },
  ], '2026-07-11', '2026-07-25', 'Europe/Oslo')

  assert.equal(items.length, 1)
  assert.equal(items[0].source, 'local_events')
  assert.equal(items[0].title, 'Gladmatfestivalen · Vågen')
  assert.equal(items[0].display_time, '12:00')
})

test('local event frame title removes trailing date suffixes without removing dates in the middle', () => {
  const rows = [
    { id: '1', user_id: 'u1', provider: 'local_events', external_id: 'edge-of-norway:1', title: '14:00 Sunday tour: Lervigskvartalet, 12 July', body: null, starts_at: '2026-07-12T14:00:00+02:00', due_at: null, priority: 8, raw: { source: 'local_events', type: 'local_event' } },
    { id: '2', user_id: 'u1', provider: 'local_events', external_id: 'edge-of-norway:2', title: 'Sunday tour: Lervigskvartalet, 12 July', body: null, starts_at: '2026-07-19T14:00:00+02:00', due_at: null, priority: 8, raw: { source: 'local_events', type: 'local_event' } },
    { id: '3', user_id: 'u1', provider: 'local_events', external_id: 'edge-of-norway:3', title: 'Football festival in Vågen on 11 July – Norway v England', body: null, starts_at: '2026-07-12T17:00:00+02:00', due_at: null, priority: 8, raw: { source: 'local_events', type: 'local_event' } },
  ]
  const items = buildLocalEventItems(rows, '2026-07-11', '2026-07-20', 'Europe/Oslo')
  assert.equal(items[0].title, '14:00 Sunday tour: Lervigskvartalet')
  assert.equal(items[1].title, 'Sunday tour: Lervigskvartalet')
  assert.equal(items[2].title, 'Football festival in Vågen on 11 July – Norway v England')
})

test('local events sort after personal reminders at same time', () => {
  const local = buildLocalEventItems([
    { id: '1', user_id: 'u1', provider: 'local_events', external_id: 'edge-of-norway:1', title: 'Local', body: null, starts_at: '2026-07-12T12:00:00+02:00', due_at: null, priority: 8, raw: { source: 'local_events', type: 'local_event' } },
  ], '2026-07-11', '2026-07-25', 'Europe/Oslo')[0]
  const manual = { ...local, reminder_id: 'manual', title: 'Manual', source: 'remind' }
  assert.deepEqual([local, manual].sort(compareReminderItems).map((x) => x.source), ['local_events', 'remind'])
})
