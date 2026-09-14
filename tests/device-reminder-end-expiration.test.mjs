import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
const rowType = source.slice(source.indexOf('type ReminderRow = {'), source.indexOf('type PhysicalDeviceReminderItem'))
const endHelpers = source.slice(source.indexOf('function hasExplicitReminderEnd('), source.indexOf('function recurringOccurrencesExpiringNow('))
const occurrenceBuilder = source.slice(source.indexOf('function buildOccurrencesForRow('), source.indexOf('export async function GET('))
const getRoute = source.slice(source.indexOf('export async function GET('))

test('device reminder feed loads explicit end date and time fields', () => {
  assert.match(rowType, /end_date: string \| null/)
  assert.match(rowType, /end_time: string \| null/)
  assert.match(getRoute, /due_date, due_time, end_date, end_time, repeat_type/)
})

test('explicit end boundaries are shifted with recurring occurrence dates', () => {
  assert.match(endHelpers, /durationDays = diffDaysFromYmd\(dueDate, endDate\)/)
  assert.match(endHelpers, /endYmd = toLocalYmd\(addDaysLocal\(occurrence, durationDays\)\)/)
})

test('frame expiry uses start time first, end time only as fallback, then the occurrence day', () => {
  assert.match(endHelpers, /const startTime = normalizeReminderTime\(row\.due_time\)/)
  assert.match(endHelpers, /if \(startTime\) \{[\s\S]*?return startTime < nowHm/)
  assert.match(endHelpers, /const endTime = normalizeReminderTime\(row\.end_time\)/)
  assert.match(endHelpers, /if \(endTime\) \{[\s\S]*?const endYmd = boundary\?\.endYmd \|\| occurrenceYmd[\s\S]*?return endTime < nowHm/)
  assert.match(endHelpers, /return occurrenceYmd < todayYmd/)
})

test('occurrence builder always applies frame expiry before adding an item', () => {
  assert.match(occurrenceBuilder, /if \(isOccurrenceExpiredForFrame\(row, occurrenceYmd, todayYmd, nowHm\)\) return/)
  assert.doesNotMatch(occurrenceBuilder, /if \(hasExplicitEnd\)/)
  assert.match(occurrenceBuilder, /is_user_created: !row\.starter_key/)
})

test('expired explicit-end records still persist completion bookkeeping', () => {
  assert.match(getRoute, /update\(\{ is_done: true, updated_at: now\.toISOString\(\) \}\)/)
  assert.match(getRoute, /from\('reminder_completions'\)\.upsert\(recurringCompletionRows/)
  assert.match(getRoute, /onConflict: 'reminder_id,occurrence_date'/)
  assert.match(getRoute, /completed_by_user_id: null/)
})
