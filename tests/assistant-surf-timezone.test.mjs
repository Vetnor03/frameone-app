import test from 'node:test'
import assert from 'node:assert/strict'
import { surfLoggedAt } from '../app/lib/assistant/time.ts'

test('surf local times use Oslo summer and winter offsets for today', () => {
  assert.equal(surfLoggedAt('today', '14:00', '2026-07-15T08:00:00Z', 'Europe/Oslo'), '2026-07-15T12:00:00.000Z')
  assert.equal(surfLoggedAt('today', '14:00', '2026-01-15T08:00:00Z', 'Europe/Oslo'), '2026-01-15T13:00:00.000Z')
})

test('surf yesterday uses the previous local date with its applicable offset', () => {
  assert.equal(surfLoggedAt('yesterday', '14:00', '2026-07-15T08:00:00Z', 'Europe/Oslo'), '2026-07-14T12:00:00.000Z')
  assert.equal(surfLoggedAt('yesterday', '14:00', '2026-01-15T08:00:00Z', 'Europe/Oslo'), '2026-01-14T13:00:00.000Z')
})
