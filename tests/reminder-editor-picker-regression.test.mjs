import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const editor = source.slice(source.indexOf('function ReminderDraftSheet('), source.indexOf('function DeleteReminderSheet('))
const timePicker = source.slice(source.indexOf('function TimePickerSheet('), source.indexOf('function Switch('))

test('reminder editor is constrained to vertical touch scrolling', () => {
  assert.match(editor, /reminder-sheet-scroll[^\n]*overflow-x-hidden overflow-y-auto[^\n]*touch-pan-y/)
  assert.match(editor, /overscroll-behavior-x: none/)
  assert.match(editor, /\.reminder-sheet-scroll > \*/)
})

test('start and end fields share app date and time picker sheets', () => {
  assert.equal((editor.match(/<DatePickerSheet/g) || []).length, 2)
  assert.equal((editor.match(/<TimePickerSheet/g) || []).length, 2)
  assert.doesNotMatch(editor, /<input type="(?:date|time)"/)
  assert.match(editor, /formatReminderPickerDateLabel\(language, date\)/)
  assert.match(editor, /formatReminderPickerDateLabel\(language, endDate\)/)
})

test('existing values initialize pickers and optional values remain clearable', () => {
  assert.match(editor, /parseYmdToLocalDate\(endDate \|\| date\)/)
  assert.match(editor, /normalizeReminderTime\(endTime\) \|\| normalizedTime/)
  assert.match(editor, /clear: \(\) => setEndDate\(''\)/)
  assert.match(editor, /clear: \(\) => setEndTime\(''\)/)
  assert.match(editor, /setEndDate\(toLocalYmd\(d\)\)/)
  assert.match(editor, /setEndTime\(`\$\{pad2\(rounded\.getHours\(\)\)\}:\$\{pad2\(rounded\.getMinutes\(\)\)\}`\)/)
})

test('end-before-start validation and persisted values are unchanged', () => {
  assert.match(editor, /endDate && endDate < cleanDate/)
  assert.match(editor, /endTime < normalizedTime/)
  assert.match(editor, /end_date: endDate \|\| null/)
  assert.match(editor, /end_time: normalizeReminderTime\(endTime\)/)
})

test('wheel selection background is behind always-visible wheel values', () => {
  assert.equal((timePicker.match(/absolute left-0 right-0 z-0/g) || []).length, 2)
  assert.equal((timePicker.match(/relative z-10 overflow-x-hidden overflow-y-auto/g) || []).length, 2)
})
