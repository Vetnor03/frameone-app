import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EditorialRole, editorialPlan, editorialRole,
  showEditorialRole, editorialListCapacity, editorialModuleKind,
} from '../app/lib/editorialFrameLayout.mjs'

test('frame mirror matches firmware editorial geometry profiles', () => {
  for (const [w, h, shape] of [
    [200, 120, 'compact'], [800, 120, 'ribbon'],
    [200, 480, 'column'], [400, 240, 'card'], [800, 480, 'spread'],
  ]) assert.equal(editorialPlan(w, h).shape, shape)
  assert.equal(editorialPlan(800, 480).columns, 2)
  assert.equal(editorialPlan(200, 120).columns, 1)
  assert.equal(editorialPlan(0, 0).safeWidth, 0)
})

test('primary facts win and figures yield on small frame cells', () => {
  const small = editorialPlan(200, 120)
  const large = editorialPlan(800, 480)
  assert.equal(editorialRole(small, EditorialRole.PRIMARY).visible, true)
  assert.equal(editorialRole(large, EditorialRole.HERO).font, 'bold18')
  assert.equal(showEditorialRole(small, EditorialRole.FIGURE, 'decorative'), false)
  assert.equal(showEditorialRole(large, EditorialRole.FIGURE, 'decorative'), true)
  assert.equal(showEditorialRole(small, EditorialRole.SECONDARY, 'optional'), false)
  assert.equal(editorialListCapacity(small, 0), 0)
  assert.ok(editorialListCapacity(large, 90) > 0)
})

test('all shipped modules have editorial content kinds and reject near matches', () => {
  const modules = ['date', 'reminders', 'weather:2', 'news', 'surf:1', 'ski:1',
    'countdown', 'soccer:1', 'stocks:1', 'groceries', 'assistant']
  for (const name of modules) assert.notEqual(editorialModuleKind(name), 'unknown', name)
  assert.equal(editorialModuleKind('weatherwolf'), 'unknown')
})
