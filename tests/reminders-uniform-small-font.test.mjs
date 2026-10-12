import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('every physical Reminders layout uses the regular 9pt font', async () => {
  const firmware = await readFile(new URL('frame/src/modules/ModuleReminders.cpp', root), 'utf8')

  assert.match(firmware, /REMINDER_CONTENT_FONT = FONT_B9/)
  assert.doesNotMatch(firmware, /FONT_B12|FONT_B18|FreeSansBold12ptNO|FreeSansBold18ptNO/)
  // Headers, month labels, empty states, titles and overflow all share 9pt.
  assert.match(firmware, /const GFXfont\* f1 = REMINDER_CONTENT_FONT/)
  assert.match(firmware, /measureText\(mname, REMINDER_CONTENT_FONT/)
  assert.match(firmware, /measureText\(headerBuf, REMINDER_CONTENT_FONT/)
  assert.match(firmware, /drawAdaptiveLabel\(\{rect\.x, rect\.y, rect\.w, headingH\}, headingText, REMINDER_CONTENT_FONT\)/)
  assert.match(firmware, /drawAdaptiveLabel\(\{inner\.x, inner\.y, inner\.w, headingH\}, heading, REMINDER_CONTENT_FONT\)/)
  for (const render of ['renderSmall', 'renderMedium', 'renderLarge', 'renderXL', 'renderAdaptiveReminders']) {
    assert.match(firmware, new RegExp('static void ' + render + '\\('))
  }
})

test('every Reminders preview uses the same small font in all fixed sizes and calendar dates', async () => {
  const preview = await readFile(new URL('app/HomePageClient.tsx', root), 'utf8')
  const expected = 'text-[clamp(0.68rem,1.55vw,0.85rem)]'
  assert.match(preview, /const MIRROR_REMINDER_TEXT_CLASS = "text-\[clamp\(0\.68rem,1\.55vw,0\.85rem\)\]"/)
  assert.match(preview, /function MirrorReminderHeader/)
  const segment = preview.split('function MirrorLargeRemindersCard(')[1]?.split('function MirrorSkiCard(')[0]
  assert.ok(segment, 'the Reminders preview components must exist')
  const explicitSizes = [...segment.matchAll(/text-\[clamp\([^)]*\)\]/g)].map(m => m[0])
  assert.ok(explicitSizes.length > 0)
  assert.ok(explicitSizes.every(size => size === expected))
  assert.doesNotMatch(segment, /<MirrorModuleHeader\s/)
  assert.equal([...segment.matchAll(/<MirrorMonthCalendar/g)].length, 3)
  assert.equal([...segment.matchAll(/compactText/g)].length, 3)
  // Calendar font changes are opt-in: other modules keep their own typography.
  const calendar = preview.split('function MirrorMonthCalendar(')[1]?.split('function MirrorHolidayList(')[0]
  assert.ok(calendar)
  assert.match(calendar, /compactText = false/)
  assert.equal([...calendar.matchAll(/compactText \? MIRROR_REMINDER_TEXT_CLASS/g)].length, 4)
})
