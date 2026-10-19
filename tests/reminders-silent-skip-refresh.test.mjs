import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const homePage = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('local event skip toggles revalidate reminders without showing global loading', () => {
  const remindersStart = homePage.indexOf('function RemindersModuleSettingsTab')
  const loadStart = homePage.indexOf('async function loadReminders', remindersStart)
  const toggleStart = homePage.indexOf('async function toggleLocalEventFrameSkip', loadStart)
  const toggleEnd = homePage.indexOf('function toggleSelectedDay', toggleStart)

  assert.ok(remindersStart >= 0)
  assert.ok(loadStart > remindersStart)
  assert.ok(toggleStart > loadStart)
  assert.ok(toggleEnd > toggleStart)

  const loader = homePage.slice(loadStart, toggleStart)
  assert.match(loader, /\{ silent = false \}: \{ silent\?: boolean \} = \{\}/)
  assert.match(loader, /if \(!silent\) setLoading\(true\)/)
  assert.match(loader, /if \(!silent\) setLoading\(false\)/)

  const toggle = homePage.slice(toggleStart, toggleEnd)
  assert.match(toggle, /setReminders\(\(current\) => current\.map/)
  assert.match(toggle, /await loadReminders\(\{ silent: true \}\)/)
  assert.doesNotMatch(toggle, /remind:refresh-reminders/)
})

test('skipped Events stay in the app with their Skipped state and undo action', () => {
  // A frame skip must never remove Events from the app or calendar after 24 hours.
  assert.doesNotMatch(homePage, /localEventHiddenSkippedIds|localEventSkipIsHiddenFromCalendar|LOCAL_EVENT_CALENDAR_SKIP_HIDE_AFTER_MS/)
  assert.match(homePage, /skippedOnFrame: source === 'local-events' \? \(localEventSkippedIds\.has\(externalEventId\)/)
  assert.match(homePage, /toggleLocalEventFrameSkip\(item, !item\.skippedOnFrame\)/)
  assert.match(homePage, /scope: 'group'/)
  // Ticket booking must remain possible even when an event is skipped on the frame.
  assert.match(homePage, /disabled=\{!!bookingEventId\} onClick=\{\(\) => markEventPerformanceBooked\(option\)\}/)
})
