import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const moduleReminders = readFileSync(new URL('../frame/src/modules/ModuleReminders.cpp', import.meta.url), 'utf8')
const updateChecker = readFileSync(new URL('../frame/src/network/UpdateChecker.cpp', import.meta.url), 'utf8')

test('physical frame reminder requests use cached provider rows like mirror view', () => {
  assert.match(moduleReminders, /\/api\/device\/reminders\?device_id=/)
  assert.match(moduleReminders, /&limit=20&tz=Europe\/Oslo&skip_sync=1/)
})

test('reminder signature checks do not trigger integration syncs', () => {
  assert.match(updateChecker, /String buildRemindersUrl\(\)/)
  assert.match(updateChecker, /&limit=20&tz=Europe\/Oslo&skip_sync=1/)
})
