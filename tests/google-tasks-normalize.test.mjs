import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGoogleTask } from '../app/lib/integrations/google-tasks/normalize.mjs'

test('Google Tasks due dates remain all day without invented clock times', () => {
  const item = normalizeGoogleTask({ id: 'one', title: 'Water flowers', due: '2026-11-21T00:00:00.000Z' }, 'list')
  assert.equal(item.raw.date, '2026-11-21')
  assert.equal(item.raw.all_day, true)
  assert.equal(item.starts_at, '2026-11-21T12:00:00.000Z')
  assert.equal(item.raw.floating_time, undefined)
})
test('completed, deleted, and undated tasks are excluded', () => {
  const task = { id: 'a', title: 'Task', due: '2026-11-21T00:00:00.000Z' }
  assert.equal(normalizeGoogleTask({ ...task, status: 'completed' }, 'list'), null)
  assert.equal(normalizeGoogleTask({ ...task, deleted: true }, 'list'), null)
  assert.equal(normalizeGoogleTask({ ...task, hidden: true }, 'list'), null)
  assert.equal(normalizeGoogleTask({ id: 'a', title: 'No due' }, 'list'), null)
  assert.equal(normalizeGoogleTask({ ...task, due: '2026-02-31T00:00:00.000Z' }, 'list'), null)
})
test('task identifiers are separated by list', () => {
  const task = { id: 'id', title: 'Something', due: '2026-11-21T00:00:00Z' }
  assert.notEqual(normalizeGoogleTask(task, 'first').external_id, normalizeGoogleTask(task, 'second').external_id)
})
