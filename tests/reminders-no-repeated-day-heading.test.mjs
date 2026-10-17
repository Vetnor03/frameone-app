import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('reminder day headings are not repeated next to each item', async () => {
  const firmware = await readFile(new URL('frame/src/modules/ModuleReminders.cpp', root), 'utf8')
  const centered = firmware.split('static int drawBucketLinesCentered(')[1]
    ?.split('// =========================================================\n// Calendar drawing')[0]
  assert.ok(centered, 'Shared medium/large reminder list renderer must exist')
  // renderMedium already shows "Today", "Tomorrow" or a weekday in its heading.
  // The same day must not be appended to each reminder title underneath.
  assert.match(centered, /const char\* label = "";/)
  assert.doesNotMatch(centered, /buildRelativeDateText\(bucket\.daysUntil/)
  assert.match(firmware, /strlcpy\(headerBuf, "Tomorrow", sizeof\(headerBuf\)\)/)
  // A real display_time is still part of the reminder item text.
  assert.match(firmware, /snprintf\(out, outSize, "%s %s", r\.time, cleanTitle\)/)
})
