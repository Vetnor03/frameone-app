import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMicrosoftTodoTask } from '../app/lib/integrations/microsoft-todo/normalize.mjs'

const due = (dateTime, timeZone = 'W. Europe Standard Time') => ({ dateTime, timeZone })
test('Microsoft To Do keeps midnight due dates as date-only tasks', () => {
  const task = normalizeMicrosoftTodoTask({id:'42',title:'Water plants',dueDateTime:due('2026-11-21T00:00:00.0000000')},'list')
  assert.equal(task.raw.date,'2026-11-21')
  assert.equal(task.raw.all_day,true)
  assert.equal(task.starts_at,'2026-11-21T12:00:00.000Z')
})
test('Microsoft To Do preserves reminder time on the due date with DST', () => {
  const task = normalizeMicrosoftTodoTask({
    id:'42',title:'Submit report',dueDateTime:due('2026-11-21T00:00:00'),
    isReminderOn:true,reminderDateTime:due('2026-11-21T14:30:00')
  },'list',{timeZone:'Europe/Oslo'})
  assert.equal(task.raw.all_day,false)
  assert.equal(task.raw.floating_time,undefined)
  assert.equal(task.starts_at,'2026-11-21T13:30:00.000Z')
})
test('UTC task times must not be interpreted as floating local times', () => {
  const task=normalizeMicrosoftTodoTask({
    id:'utc',title:'Call',dueDateTime:due('2026-11-21T14:00:00','UTC')
  },'list',{timeZone:'Europe/Oslo'})
  assert.equal(task.starts_at,'2026-11-21T14:00:00.000Z')
  assert.equal(task.raw.floating_time,undefined)
})
test('different due dates and reminder dates do not change the due date', () => {
  const task = normalizeMicrosoftTodoTask({
    id:'a',title:'Deadline',dueDateTime:due('2026-11-25T00:00:00'),
    isReminderOn:true,reminderDateTime:due('2026-11-24T09:00:00')
  },'list')
  assert.equal(task.raw.date,'2026-11-25')
  assert.equal(task.raw.all_day,true)
  assert.equal(task.raw.reminder_at,'2026-11-24 09:00')
})
test('completed and undated tasks do not enter reminder feed', () => {
  assert.equal(normalizeMicrosoftTodoTask({id:'a',title:'Done',status:'completed',dueDateTime:due('2026-11-21T00:00:00')},'list'),null)
  assert.equal(normalizeMicrosoftTodoTask({id:'a',title:'No date'},'list'),null)
})
test('task ids are namespaced by list to prevent collisions',()=>{
  const task={id:'a',title:'Plan',dueDateTime:due('2026-11-21T00:00:00')}
  assert.notEqual(normalizeMicrosoftTodoTask(task,'one').external_id,normalizeMicrosoftTodoTask(task,'two').external_id)
})
