import test from 'node:test'
import assert from 'node:assert/strict'
import { physicalModuleDeadlines } from '../app/lib/device/contentSignature.mjs'

const settings = {
  cells: [
    { module: 'date', col: 0, row: 0, w: 400, h: 240 },
    { module: 'reminders', col: 2, row: 0, w: 400, h: 240 },
  ],
  modules: {},
}
const sourcesAt = (date, hhmm) => ({
  reminders: { items: [{ title: 'DST boundary test', occurrence_date: date, display_time: hhmm, days_until: 0 }] },
})
const boundaryAt = (date, hhmm, now) => physicalModuleDeadlines({
  settings, sources: sourcesAt(date, hhmm), now: Date.parse(now),
}).reminders.filter((d) => d.reason === 'reminder_boundary').map((d) => d.at)

test('Oslo 02:30 fall-back reminder expires at FIRST occurrence, not one hour late', () => {
  const now = '2026-10-24T22:30:00Z'
  const boundaries = boundaryAt('2026-10-25', '02:30', now)
  assert.deepEqual(boundaries, [Date.parse('2026-10-25T00:30:00Z')])
  assert.ok(!boundaries.includes(Date.parse('2026-10-25T01:30:00Z')))
})

test('past FIRST occurrence never reschedules a stale reminder in repeated 02:xx hour', () => {
  assert.deepEqual(boundaryAt('2026-10-25', '02:30', '2026-10-25T00:40:00Z'), [])
  assert.deepEqual(boundaryAt('2026-10-25', '02:30', '2026-10-25T01:10:00Z'), [])
})

test('adjacent October winter-time events keep correct absolute deadlines', () => {
  assert.deepEqual(boundaryAt('2026-10-25', '01:30', '2026-10-24T22:30:00Z'),
    [Date.parse('2026-10-24T23:30:00Z')])
  assert.deepEqual(boundaryAt('2026-10-25', '03:30', '2026-10-24T22:30:00Z'),
    [Date.parse('2026-10-25T02:30:00Z')])
})

test('midnight after fall-back is 23:00Z, not 22:00Z', () => {
  const deadlines = physicalModuleDeadlines({
    settings, sources: sourcesAt('2026-10-25', '02:30'),
    now: Date.parse('2026-10-25T11:00:00Z'),
  })
  assert.deepEqual(deadlines.date, [{
    at: Date.parse('2026-10-25T23:00:00Z'),
    type: 'hard',
    reason: 'midnight',
  }])
})
