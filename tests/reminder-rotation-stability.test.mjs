import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { physicalRenderProjection, physicalModuleDeadlines } from '../app/lib/device/contentSignatureBase.mjs'

const rows = Array.from({ length: 6 }, (_, i) => ({
  reminder_id: 'remind-' + i,
  title: 'Reminder ' + i,
  occurrence_date: '2026-10-14',
  display_date: 'Today',
  days_until: 0,
  is_overdue: false,
  due_time: null,
  display_time: null,
}))
const source = { ok: true, items: rows }
const cell = { module: 'reminders', slot: 0, size: 'SMALL', w: 800, h: 120 }
const before = Date.parse('2026-10-14T11:59:00Z')
const after = Date.parse('2026-10-14T12:01:00Z')

test('physical Reminders projection never rotates canonical priority at UTC 4-hour boundaries', () => {
  const first = physicalRenderProjection('reminders', source, cell, {}, before)
  const second = physicalRenderProjection('reminders', source, cell, {}, after)
  assert.deepEqual(second, first)
  assert.deepEqual(first.visible.primary.visible.map(item => item.title), [
    'Reminder 0', 'Reminder 1', 'Reminder 2',
  ])
})

test('Reminders keep real time/midnight deadlines, but never wake for a removed rotation', () => {
  const settings = { cells: [cell], modules: {}, layout: 'pyramid' }
  const deadlines = physicalModuleDeadlines({ settings, sources: { reminders: source }, now: before }).reminders
  assert.ok(deadlines.some(row => row.reason === 'midnight' && row.type === 'hard'))
  assert.ok(deadlines.every(row => row.reason !== 'reminder_rotation'))
  const timed = { ok: true, items: [{
    ...rows[0], occurrence_date: '2026-10-15', due_time: '09:00', display_time: '09:00',
  }] }
  const timeDeadlines = physicalModuleDeadlines({
    settings, sources: { reminders: timed }, now: before,
  }).reminders
  assert.ok(timeDeadlines.some(row => row.reason === 'reminder_boundary' && row.type === 'hard'))
})

test('firmware consumes ordered reminder indexes without any four-hour visual rotation', () => {
  const cpp = readFileSync(new URL('../frame/src/modules/ModuleReminders.cpp', import.meta.url), 'utf8')
  assert.match(cpp, /bucket\.itemIdx\[i\]/)
  assert.doesNotMatch(cpp, /getRotationStep4h|wrapIndex|\brotation\b/)
})
