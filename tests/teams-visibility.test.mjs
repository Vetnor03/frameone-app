import assert from 'node:assert/strict'
import test from 'node:test'

import { isTeamsMeetingVisibleAt } from '../app/lib/integrations/teams/visibility.ts'

test('Microsoft/Teams meeting visibility expires from start time, not end time', () => {
  const startsAt = '2026-01-01T20:00:00.000Z'
  const endsAt = '2026-01-01T21:00:00.000Z'

  assert.equal(isTeamsMeetingVisibleAt(startsAt, new Date('2026-01-01T19:59:00.000Z')), true)
  assert.equal(isTeamsMeetingVisibleAt(startsAt, new Date('2026-01-01T20:00:59.000Z')), true)
  assert.equal(isTeamsMeetingVisibleAt(startsAt, new Date('2026-01-01T20:01:00.000Z')), false)

  assert.equal(new Date(endsAt).getTime() > new Date('2026-01-01T20:01:00.000Z').getTime(), true)
})
