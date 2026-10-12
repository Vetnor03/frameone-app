import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('reminder entries always use 9pt across frame sizes, while headings retain their original font', async () => {
  const firmware = await readFile(new URL('frame/src/modules/ModuleReminders.cpp', root), 'utf8')

  assert.match(firmware, /REMINDER_CONTENT_FONT = FONT_B9/)
  assert.match(firmware, /const GFXfont\* font = REMINDER_CONTENT_FONT/)
  assert.match(firmware, /layout\.font = REMINDER_CONTENT_FONT/)
  assert.match(firmware, /return \{FONT_B9, 88, 5, 48\}/)
  // Every adaptive item uses the normal small font, not a dynamically selected font.
  assert.match(firmware, /item\.title, lines, maxLines, titleRect\.w, FONT_B9, complete/)
  // Section headings, empty states and calendar headings are *not* reminder entries.
  assert.match(firmware, /const GFXfont\* f1 = FONT_B12/)
  assert.match(firmware, /measureText\(mname, FONT_B12/)
  assert.match(firmware, /measureText\(headerBuf, FONT_B12/)
  assert.match(firmware, /drawAdaptiveLabel\(\{rect\.x, rect\.y, rect\.w, headingH\}, headingText, FONT_B12\)/)
  assert.match(firmware, /drawAdaptiveLabel\(\{inner\.x, inner\.y, inner\.w, headingH\}, heading, FONT_B12\)/)
})

test('only reminder entries share the small preview font; headings and calendars keep their styles', async () => {
  const preview = await readFile(new URL('app/HomePageClient.tsx', root), 'utf8')
  const segment = preview.split('function MirrorLargeRemindersCard(')[1]?.split('function MirrorSkiCard(')[0]
  assert.ok(segment, 'Reminders preview components must exist')
  const smallFont = 'text-[clamp(0.68rem,1.55vw,0.85rem)]'

  // Small/medium reminder titles, plus XL reminder dates and titles.
  assert.equal(segment.split(smallFont).length - 1, 4)
  assert.ok(segment.includes('min-w-0 truncate ' + smallFont))
  // Preserve the original styling for the rest of the module.
  assert.equal([...segment.matchAll(/<MirrorModuleHeader\s/g)].length, 4)
  assert.equal([...segment.matchAll(/<MirrorMonthCalendar/g)].length, 3)
  assert.doesNotMatch(segment, /compactText|MirrorReminderHeader/)
  assert.match(segment, /text-\[clamp\(0\.48rem,1vw,0\.66rem\)\]/) // overflow labels unchanged

  const calendar = preview.split('function MirrorMonthCalendar(')[1]?.split('function MirrorHolidayList(')[0]
  assert.ok(calendar)
  assert.doesNotMatch(calendar, /compactText/)
})
