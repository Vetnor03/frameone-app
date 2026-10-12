import assert from 'node:assert/strict'
import test from 'node:test'
import { localEventGroupKey, localEventGroupKeyFromRaw, groupUpcomingEvents, groupSkipId } from '../app/lib/integrations/local-events/grouping.ts'
import { buildLocalEventFrameItem } from '../app/lib/device/remindersFeed.ts'

const now = new Date('2026-10-12T11:00:00.000Z')
const row = (id, title, date, venue = 'Forum Scene', hours = '18:00:00') => ({
  id, user_id: 'u1', provider: 'edge-of-norway', external_id: id, title,
  body: null, starts_at: date + 'T' + hours + 'Z', due_at: null, priority: 0,
  raw: { title, venue, date, eventSource: 'ticketmaster', sourceUrl: 'https://ticketmaster.no/' + id },
})
const several = [
  row('first', 'Waterloo', '2026-10-14'),
  row('second', 'Waterloo', '2026-10-15'),
  row('third', 'Waterloo', '2026-10-16'),
  row('different', 'Waterloo', '2026-10-17', 'Another Scene'),
  row('different-show', 'Julegøy', '2026-10-17'),
]

test('group keys are stable across date and source but distinguish separate venues', () => {
  const key = localEventGroupKey(' Waterloo! ', 'FORUM SCENE', 'billetto')
  assert.equal(key, localEventGroupKey('waterloo', 'Forum Scene', 'ticketmaster'))
  assert.notEqual(key, localEventGroupKey('Waterloo', 'Another Scene', 'ticketmaster'))
  assert.notEqual(localEventGroupKey('Waterloo', null, 'billetto'), localEventGroupKey('Waterloo', null, 'ticketmaster'))
  assert.equal(localEventGroupKeyFromRaw(several[0]), key)
})

test('app-facing grouping promotes the next show when the previous expires', () => {
  const candidates = [
    { id: 'early', title: 'Waterloo', venue: 'Forum Scene', date: '2026-10-14', time: '20:00' },
    { id: 'late', title: 'Waterloo', venue: 'Forum Scene', date: '2026-10-15', time: '19:00' },
    { id: 'another', title: 'Waterloo', venue: 'Another Scene', date: '2026-10-15', time: '19:00' },
  ]
  const initial = groupUpcomingEvents(candidates, '2026-10-14', '12:00')
  assert.equal(initial.length, 2)
  assert.equal(initial[0].performances.length, 2)
  const next = groupUpcomingEvents(candidates, '2026-10-15', '12:00')
  assert.equal(next.length, 2)
  assert.equal(next.find(g => g.performances[0].venue === 'Forum Scene').performances[0].id, 'late')
})

test('frame shows one upcoming option per venue/title and switches after first expires', () => {
  const initial = buildLocalEventFrameItem(several, [], '2026-10-12', now)
  assert.equal(initial.length, 3)
  assert.deepEqual(new Set(initial.map(e => e.external_id)), new Set(['first', 'different', 'different-show']))
  const later = buildLocalEventFrameItem(several, [], '2026-10-15', new Date('2026-10-15T19:00:00.000Z'))
  assert.equal(later.length, 3)
  assert.ok(later.some(e => e.external_id === 'third'))
  assert.ok(!later.some(e => e.external_id === 'first' || e.external_id === 'second'))
})

test('frame skip marker suppresses all options, and booked reminder suppresses event only', () => {
  const key = localEventGroupKeyFromRaw(several[0])
  const skips = [{ device_id: 'frame1', provider: 'edge-of-norway', external_event_id: groupSkipId(key), skipped: true }]
  const skipped = buildLocalEventFrameItem(several, skips, '2026-10-12', now)
  assert.equal(skipped.length, 2)
  assert.ok(skipped.every(e => e.title !== 'Waterloo' || e.raw?.venue !== 'Forum Scene'))
  const booked = buildLocalEventFrameItem(several, [], '2026-10-12', now, [key])
  assert.equal(booked.length, 2)
  const restored = buildLocalEventFrameItem(several, [], '2026-10-12', now)
  assert.equal(restored.length, 3)
})
