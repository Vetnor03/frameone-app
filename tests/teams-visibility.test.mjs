import assert from 'node:assert/strict'
import test from 'node:test'

import { isTeamsMeetingVisibleAt } from '../app/lib/integrations/teams/visibility.ts'
import { buildTeamsMeetingItems } from '../app/lib/device/remindersFeed.ts'

test('Microsoft/Teams meeting visibility expires at the exact start time, not a minute later or at the end', () => {
  const startsAt = '2026-01-01T20:00:00.000Z'
  const endsAt = '2026-01-01T21:00:00.000Z'

  assert.equal(isTeamsMeetingVisibleAt(startsAt, new Date('2026-01-01T19:59:59.999Z')), true)
  assert.equal(isTeamsMeetingVisibleAt(startsAt, new Date('2026-01-01T20:00:00.000Z')), false)
  assert.equal(isTeamsMeetingVisibleAt(startsAt, new Date('2026-01-01T20:00:48.000Z')), false)
  assert.equal(isTeamsMeetingVisibleAt(startsAt, new Date('2026-01-01T20:00:59.000Z')), false)

  assert.equal(new Date(endsAt).getTime() > new Date('2026-01-01T20:00:48.000Z').getTime(), true)
})

test('physical frame feed excludes a Teams meeting when it refreshes during the start minute', () => {
  const meeting = {
    provider: 'teams',
    external_id: 'daily-bank',
    title: 'Dagligbank',
    starts_at: '2026-10-14T12:00:00.000Z',
    due_at: '2026-10-14T13:00:00.000Z',
  }

  const feed = (now) => buildTeamsMeetingItems(
    [meeting],
    '2026-10-14',
    '2026-10-16',
    'Europe/Oslo',
    new Date(now),
  )

  assert.equal(feed('2026-10-14T11:59:59.000Z').length, 1)
  assert.equal(feed('2026-10-14T12:00:00.000Z').length, 0)
  assert.equal(feed('2026-10-14T12:00:48.000Z').length, 0)
})
