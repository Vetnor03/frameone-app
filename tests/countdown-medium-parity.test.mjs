import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const firmware = readFileSync(new URL('../frame/src/modules/ModuleCountdown.cpp', import.meta.url), 'utf8')
const mirror = app.slice(app.indexOf('function formatMirrorCountdownMediumBadge('), app.indexOf('function formatMirrorCountdownUpcomingStatus('))
const physical = firmware.slice(firmware.indexOf('static void formatMediumBadge('), firmware.indexOf('static void formatEventDaysLine('))

test('physical and Mirror medium badges use target timing rather than another duration', () => {
  for (const source of [mirror, physical]) {
    assert.match(source, /daysLeft <= 6/)
    assert.match(source, /daysLeft <= 13/)
    assert.match(source, /daysLeft < 60/)
    assert.doesNotMatch(source, /In %d days|In \$\{daysLeft\} days|In 2 weeks|In 3 weeks|In 4 weeks|Next month|formatShortStatus/)
  }
  assert.match(mirror, /day: 'numeric', month: 'short'/)
  assert.match(physical, /"%d %s", d, mediumBadgeMonthShortName\(m\)/)
})
