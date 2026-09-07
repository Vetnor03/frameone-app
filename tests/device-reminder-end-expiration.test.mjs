import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
const rowType = source.slice(source.indexOf('type ReminderRow = {'), source.indexOf('type PhysicalDeviceReminderItem'))
const endHelpers = source.slice(source.indexOf('function hasExplicitReminderEnd('), source.indexOf('function buildOccurrencesForRow('))
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
  assert.match(endHelpers, /if \(boundary\.endYmd < todayYmd\) return true/)
  assert.match(endHelpers, /if \(!boundary\.endTime\) return false/)
  assert.match(endHelpers, /return boundary\.endTime < nowHm/)
})

test('explicit end overrides start-time expiry and keeps active multi-day reminders visible', () => {
  assert.match(occurrenceBuilder, /if \(hasExplicitEnd\) \{\s*if \(isOccurrencePastExplicitEnd\(row, occurrenceYmd, todayYmd, nowHm\)\) return/)
  assert.match(occurrenceBuilder, /else if \(isTimedOccurrenceAlreadyPassed\(occurrenceYmd, dueTime, todayYmd, nowHm\)\)/)
  assert.match(occurrenceBuilder, /if \(!includeOverdue && days_until < 0 && !hasExplicitEnd\) return/)
})

test('expired one-offs persist is_done while recurring reminders complete per occurrence', () => {
  assert.match(getRoute, /update\(\{ is_done: true, updated_at: now\.toISOString\(\) \}\)/)
  assert.match(getRoute, /from\('reminder_completions'\)\.upsert\(recurringCompletionRows/)
  assert.match(getRoute, /onConflict: 'reminder_id,occurrence_date'/)
  assert.match(getRoute, /completed_by_user_id: null/)
})
