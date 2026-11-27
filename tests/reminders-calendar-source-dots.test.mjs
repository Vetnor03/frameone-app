import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const homePage = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('reminder calendar dots use only occurrences from the selected source', () => {
  const filteredRemindersStart = homePage.indexOf('const filteredReminders = useMemo')
  const reminderDotsStart = homePage.indexOf('const reminderDotsByDay = useMemo', filteredRemindersStart)
  const calendarCellsStart = homePage.indexOf('const calendarCells:', reminderDotsStart)

  assert.ok(filteredRemindersStart >= 0)
  assert.ok(reminderDotsStart > filteredRemindersStart)
  assert.ok(calendarCellsStart > reminderDotsStart)

  const dotPipeline = homePage.slice(filteredRemindersStart, calendarCellsStart)
  assert.match(dotPipeline, /reminders\.filter\(\(item\) => \(item\.source \|\| 'remind'\) === sourceFilter\)/)
  assert.match(dotPipeline, /expandReminderOccurrences\(filteredReminders,/)
  assert.match(dotPipeline, /for \(const item of visibleOccurrences\)/)
  assert.doesNotMatch(dotPipeline, /item\.source === 'local-events'/)
})

test('tapping any reminder source filter clears the selected calendar day', () => {
  assert.match(homePage, /availableSources\.map\(\(source\) => \{[\s\S]*?onClick=\{\(\) => \{\s*setSourceFilter\(source\)\s*setSelectedDayYmd\(null\)\s*\}\}/)
  assert.match(homePage, /function toggleSelectedDay\(ymd: string\) \{\s*setSelectedDayYmd\(\(prev\) => \(prev === ymd \? null : ymd\)\)/)
})
