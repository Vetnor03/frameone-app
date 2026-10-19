import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { isUpcomingIntegratedCalendarItem } from '../app/lib/device/calendarVisibility.ts'

test('Teams, Spond and public Events disappear at their exact start minute in the app calendar', () => {
  for (const source of ['teams', 'google-calendar', 'spond', 'local-events']) {
    assert.equal(isUpcomingIntegratedCalendarItem(source, '2026-10-14', '18:00', '2026-10-14', '17:59'), true, source)
    assert.equal(isUpcomingIntegratedCalendarItem(source, '2026-10-14', '18:00', '2026-10-14', '18:00'), false, source)
    assert.equal(isUpcomingIntegratedCalendarItem(source, '2026-10-14', '18:00', '2026-10-14', '18:01'), false, source)
    assert.equal(isUpcomingIntegratedCalendarItem(source, '2026-10-14', '20:00', '2026-10-14', '18:00'), true, source)
  }
})

test('date-only events remain visible through their date, and manual and waste rules stay unchanged', () => {
  for (const source of ['teams', 'google-calendar', 'spond', 'local-events']) {
    assert.equal(isUpcomingIntegratedCalendarItem(source, '2026-10-14', null, '2026-10-14', '23:59'), true)
    assert.equal(isUpcomingIntegratedCalendarItem(source, '2026-10-13', null, '2026-10-14', '00:00'), false)
  }
  for (const source of ['remind', 'waste']) {
    assert.equal(isUpcomingIntegratedCalendarItem(source, '2026-10-14', '18:00', '2026-10-14', '18:30'), true)
  }
})

test('Reminders UI uses the shared integrated-calendar filter and a minute-aligned clock', () => {
  const app = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(app, /isUpcomingIntegratedCalendarItem\(item\.source, item\.date, normalizeReminderTime\(item\.time\), today, clock\)/)
  assert.match(app, /sourceFilter !== 'local-events' && sourceFilter !== 'teams' && sourceFilter !== 'google-calendar' && sourceFilter !== 'spond'/)
  assert.match(app, /60_000 - \(Date\.now\(\) % 60_000\)/)
})
