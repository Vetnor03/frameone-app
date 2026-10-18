import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatAppDate, formatAppNumericDate } from '../app/lib/dateDisplay.ts'

const app = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const ai = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')

test('all user-facing full dates are day-month-year in Norwegian and English', () => {
  assert.equal(formatAppDate('2026-10-18', 'no'), '18. oktober 2026')
  assert.equal(formatAppDate('2026-10-18', 'en'), '18 October 2026')
  assert.match(formatAppDate('2026-10-18', 'no', { weekday: true }), /^søndag 18\. oktober 2026$/)
  assert.match(formatAppDate('2026-10-18', 'en', { weekday: true }), /^Sunday, 18 October 2026$/)
  assert.equal(formatAppNumericDate('2026-10-18'), '18.10.2026')
})

test('calendar-day formatting works across leap days and year boundaries', () => {
  assert.equal(formatAppDate('2028-02-29', 'en'), '29 February 2028')
  assert.equal(formatAppNumericDate('2027-01-02'), '02.01.2027')
  assert.equal(formatAppDate('2026-12-31', 'no'), '31. desember 2026')
  assert.equal(formatAppDate('2026-10-25', 'en'), '25 October 2026')
  assert.equal(formatAppNumericDate('2026-10-25'), '25.10.2026')
})

test('invalid input never silently rolls over or changes persisted dates', () => {
  assert.equal(formatAppNumericDate('2026-02-30'), '2026-02-30')
  assert.equal(formatAppDate('2026-02-30', 'no'), '2026-02-30')
  assert.equal(formatAppDate('', 'en'), '--')
})

test('all reminder, countdown and surf date surfaces use display formatting', () => {
  assert.match(app, /function formatReminderFullDateLabel[\s\S]*?formatAppDate\(ymd, language, \{ weekday: true \}\)/)
  assert.match(app, /function formatReminderPickerDateLabel[\s\S]*?formatAppDate\(ymd, language\)/)
  assert.match(app, /\{formatAppDate\(date, language\)\}/)
  assert.match(app, /\{formatAppDate\(dateYmd, language\)\}/)
  assert.match(app, /selectedDateLabel = selectedDate \? formatAppDate\(selectedDate, language/)
  assert.match(app, /previewDate = parsed\?\.due_date \? formatAppDate\(parsed.due_date, language/)
  assert.doesNotMatch(app, /'en-US'/)
  assert.doesNotMatch(ai, /'en-US'/)
  assert.match(ai, /Intl\.DateTimeFormat\(language === 'no' \? 'nb-NO' : 'en-GB'/)
})
