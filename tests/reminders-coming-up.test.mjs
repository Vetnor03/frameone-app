import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildReminderComingUp } from '../app/lib/reminderComingUp.mjs'
import { physicalRenderProjection } from '../app/lib/device/contentSignatureBase.mjs'

const row = (title, days_until, display_time = '', date = '2026-10-20') => ({
  title, days_until, display_time, occurrence_date: date, is_overdue: false,
})
const sparse = [row('Take out the bins', 0, '09:00', '2026-10-19')]

test('Coming up appears only for sparse today and a genuinely upcoming item', () => {
  const future = row('Dentist appointment', 1, '08:00')
  assert.equal(buildReminderComingUp([...sparse, future]), 'Tomorrow at 08:00: Dentist appointment.')
  assert.equal(buildReminderComingUp([...sparse, future], 'no'), 'I morgen kl. 08:00: Dentist appointment.')
  assert.equal(buildReminderComingUp([...sparse, row('Pick up parcel', 0), future]), 'Tomorrow at 08:00: Dentist appointment.')
  assert.equal(buildReminderComingUp([...sparse, row('Pick up parcel', 0), row('Check car', 0), future]), '')
  assert.equal(buildReminderComingUp([future]), '')
  assert.equal(buildReminderComingUp(sparse), '')
})

test('Coming up looks no further than seven days, never copies today, and skips unsupported dates', () => {
  const rows = [...sparse, row('Future', 8), row('Review loan', 3, '', '2026-10-22')]
  assert.equal(buildReminderComingUp(rows), 'On Thursday: Review loan.')
  assert.equal(buildReminderComingUp([sparse[0], row('Future', 8)]), '')
  assert.equal(buildReminderComingUp([sparse[0], row('Broken', 2, '', 'not-a-date')]), '')
})

test('Coming up prioritizes busy tomorrow over a routine task and early timing over later events', () => {
  assert.equal(buildReminderComingUp([...sparse,
    row('Regular appointment', 1, '12:00'),
    row('Other thing', 1, '15:00'),
    row('Third thing', 1, '18:00'),
  ]), 'Tomorrow is busy, with 3 things scheduled.')
  assert.equal(buildReminderComingUp([...sparse,
    row('Lunch meeting', 1, '12:00'),
    row('Doctor', 1, '07:30'),
  ]), 'Tomorrow at 07:30: Doctor.')
})

test('Coming up is capped in length and does not make speculative suggestions', () => {
  const long = 'An extremely long appointment with a title that repeats important information about where to go and what to do'
  const insight = buildReminderComingUp([...sparse, row(long, 1)])
  assert.ok(insight.length <= 78)
  assert.match(insight, /Tomorrow:/)
  assert.doesNotMatch(insight, /prepare|leave early|travel|bring|remember to/i)
})

test('physical and Mirror medium UI reserve space only when there is a real insight', () => {
  const firmware = readFileSync(new URL('../frame/src/modules/ModuleReminders.cpp', import.meta.url), 'utf8')
  const medium = firmware.slice(firmware.indexOf('static void renderMedium('), firmware.indexOf('static void renderLarge('))
  assert.match(firmware, /filter\["coming_up"\] = true/)
  assert.match(firmware, /doc\["coming_up"\]/)
  assert.match(medium, /c\.size == CELL_MEDIUM && headerIsToday/)
  assert.match(medium, /bucket\.count >= 1 && bucket\.count <= 2/)
  assert.match(medium, /wrapTextToLines\(g_cache->comingUp, outlookLines,[\s\S]*?\b2,/)
  assert.match(medium, /contentBottom = c\.y \+ c\.h - 88/)
  assert.match(medium, /drawBucketLinesCentered/)
  assert.match(medium, /drawCenteredSmallNoteAtY\(c, "COMING UP"/)
  assert.match(medium, /drawnCount == visibleCount/)
  const mirror = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const card = mirror.slice(mirror.indexOf('function MirrorMediumRemindersCard('), mirror.indexOf('function MirrorSmallRemindersCard('))
  assert.match(card, /detail\.reminderComingUp/)
  assert.match(card, /line-clamp-2/)
  assert.match(card, /!comingUp && headerIsToday/)
})

test('connected future reminders are included through the authorized feed with no extra AI request', () => {
  const backend = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  const snapshot = readFileSync(new URL('../app/api/device/mirror-snapshot/base.ts', import.meta.url), 'utf8')
  assert.match(backend, /buildReminderComingUp\(displayItems, frameLanguage\)/)
  assert.match(backend, /return NextResponse\.json\(\{ items: physicalItems, coming_up: comingUp \}\)/)
  assert.match(snapshot, /reminderComingUp: firstDaysUntil === 0/)
  assert.match(snapshot, /asString\(data\.coming_up\)/)
})

test('medium physical render hashes include Coming up; small and large are unchanged', () => {
  const today = { items: [row('Take out the bins', 0, '09:00', '2026-10-19')], ok: true }
  const changed = { ...today, coming_up: 'Tomorrow at 08:00: Dentist appointment.' }
  const cell = size => ({ size, w: 400, h: 240 })
  const before = physicalRenderProjection('reminders', today, cell('MEDIUM')).visible
  const after = physicalRenderProjection('reminders', changed, cell('MEDIUM')).visible
  assert.equal(before.comingUp, undefined)
  assert.equal(after.comingUp, changed.coming_up)
  assert.deepEqual(physicalRenderProjection('reminders', today, cell('SMALL')),
    physicalRenderProjection('reminders', changed, cell('SMALL')))
  assert.deepEqual(physicalRenderProjection('reminders', today, cell('LARGE')),
    physicalRenderProjection('reminders', changed, cell('LARGE')))
})
