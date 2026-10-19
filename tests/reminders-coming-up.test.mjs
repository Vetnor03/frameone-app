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
  assert.equal(buildReminderComingUp([...sparse, future]), 'Early tomorrow: Dentist appointment at 08:00.')
  assert.equal(buildReminderComingUp([...sparse, future], 'no'), 'Tidlig i morgen: Dentist appointment kl. 08:00.')
  assert.equal(buildReminderComingUp([...sparse, row('Pick up parcel', 0), future]), 'Early tomorrow: Dentist appointment at 08:00.')
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
  ]), 'Early tomorrow: Doctor at 07:30.')
})

test('Coming up is capped in length and does not make speculative suggestions', () => {
  const long = 'An extremely long appointment with a title that repeats important information about where to go and what to do'
  const insight = buildReminderComingUp([...sparse, row(long, 1)])
  assert.ok(insight.length <= 154)
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
  assert.match(medium, /char outlookLines\[4\]\[128\]/)
  assert.match(medium, /const int maxLines = bucket\.count == 1 \? 4 : 3/)
  assert.match(medium, /wrapTextToLines\(g_cache->comingUp, outlookLines,[\s\S]*?maxLines,/)
  assert.match(medium, /showComingUp = reminderSpace >= minReminderSpace/)
  assert.match(medium, /buildSmartReminderLayout\(bucket, visibleCount,/)
  assert.match(medium, /contentBottom = outlookTop - 12/)
  assert.match(medium, /drawBucketLinesCentered/)
  assert.doesNotMatch(medium, /drawCenteredSmallNoteAtY\(c, "COMING UP"/)
  assert.match(medium, /drawnCount == visibleCount/)
  const mirror = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const card = mirror.slice(mirror.indexOf('function MirrorMediumRemindersCard('), mirror.indexOf('function MirrorSmallRemindersCard('))
  assert.match(card, /detail\.reminderComingUp/)
  assert.match(card, /visibleItems\.length === 1 \? 'line-clamp-4' : 'line-clamp-3'/)
  assert.doesNotMatch(card, />COMING UP<|>KOMMER</)
  assert.match(card, /!comingUp && headerIsToday/)
})

test('connected future reminders are included through the authorized feed with no extra AI request', () => {
  const backend = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  const snapshot = readFileSync(new URL('../app/api/device/mirror-snapshot/base.ts', import.meta.url), 'utf8')
  assert.match(backend, /buildReminderComingUp\(displayItems, frameLanguage, \{ localHour: Number\(nowHm\.slice\(0, 2\)\) \}\)/)
  assert.match(backend, /return NextResponse\.json\(\{ items: physicalItems, coming_up: comingUp \}\)/)
  assert.match(snapshot, /reminderComingUp: firstDaysUntil === 0/)
  assert.match(snapshot, /asString\(data\.coming_up\)/)
})

test('medium physical render hashes include Coming up; small and large are unchanged', () => {
  const today = { items: [row('Take out the bins', 0, '09:00', '2026-10-19')], ok: true }
  const changed = { ...today, coming_up: 'Early tomorrow: Dentist appointment at 08:00.' }
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

test('explicit deadlines outrank ordinary nearby plans but never infer a deadline', () => {
  assert.equal(buildReminderComingUp([...sparse,
    row('Routine call', 1, '14:00'),
    row('Tax deadline', 2, '', '2026-10-21'),
  ]), 'Deadline Wednesday: Tax deadline.')
  assert.equal(buildReminderComingUp([...sparse, row('Søknadsfrist', 1)], 'no'),
    'Frist i morgen: Søknadsfrist.')
  assert.equal(buildReminderComingUp([...sparse, row('Submit application', 2, '', '2026-10-21')]),
    'On Wednesday: Submit application.')
})

test('evening focuses on tomorrow; mornings can highlight an approaching week deadline', () => {
  const items = [...sparse, row('Dentist appointment', 1, '15:00'),
    row('Tax deadline', 5, '', '2026-10-24')]
  assert.equal(buildReminderComingUp(items, 'en', { localHour: 19 }),
    'Tomorrow at 15:00: Dentist appointment.')
  assert.equal(buildReminderComingUp(items, 'en', { localHour: 10 }),
    'Deadline Saturday: Tax deadline.')
})

test('sparse day can highlight a busy later weekday without losing tomorrow in the evening', () => {
  const items = [...sparse, row('Dentist appointment', 1, '15:00'),
    ...['A', 'B', 'C', 'D'].map(title => row(title, 3, '', '2026-10-22'))]
  assert.equal(buildReminderComingUp(items, 'en', { localHour: 13 }),
    'Thursday looks busy, with 4 things planned.')
  assert.equal(buildReminderComingUp(items, 'no', { localHour: 13 }),
    'Det blir travelt på torsdag: 4 planer.')
  assert.equal(buildReminderComingUp(items, 'en', { localHour: 20 }),
    'Tomorrow at 15:00: Dentist appointment. Thursday looks busy, with 4 things planned.')
})

test('duplicate calendar sources or recurring items do not manufacture a busy day', () => {
  const items = [...sparse,
    row('Take out the bins', 1),
    { ...row('Spond match', 1, '17:00'), source: 'spond' },
    { ...row('Spond match', 1, '17:00'), source: 'google-calendar' },
  ]
  assert.equal(buildReminderComingUp(items), 'Tomorrow at 17:00: Spond match.')
  assert.equal(buildReminderComingUp([...sparse, row('Take out the bins', 1)]), '')
})

test('all-day reminders do not falsely count as early starts', () => {
  const allDay = { ...row('School celebration', 1, '07:00'), is_all_day: true }
  assert.equal(buildReminderComingUp([...sparse, allDay]), 'Tomorrow: School celebration.')
  const mixed = [...sparse, allDay, row('Doctor', 1, '07:30'), row('Work', 1, '16:00')]
  assert.equal(buildReminderComingUp(mixed), 'Busy tomorrow: 3 plans. Doctor at 07:30.')
})

test('invalid dates and overlong titles never cause fabricated weekday claims', () => {
  assert.equal(buildReminderComingUp([...sparse,
    row('Impossible event', 2, '', '2026-02-31'),
    row('Real event', 3, '', '2026-10-22'),
  ]), 'On Thursday: Real event.')
  const long = 'Discuss extremely complicated payment and compliance deadline with the committee and several other stakeholders'
  const summary = buildReminderComingUp([...sparse, row(long, 2, '', '2026-10-21')])
  assert.ok(summary.length <= 154)
  assert.ok(summary.includes('Deadline Wednesday:'))
})

test('spare medium space can hold a longer, independently grounded two-fact outlook', () => {
  const items = [...sparse,
    row('Quarterly tax declaration and invoice deadline', 2, '', '2026-10-21'),
    row('Annual health check appointment with the specialist', 1, '07:15')]
  const summary = buildReminderComingUp(items, 'en', { localHour: 19 })
  assert.match(summary, /^Deadline Wednesday:/)
  assert.match(summary, /Early tomorrow:/)
  assert.ok(summary.length > 78 && summary.length <= 154)

  // With two reminders today, avoid a lengthy two-fact paragraph.
  const twoToday = [...items, row('Collect parcel', 0, '', '2026-10-19')]
  assert.equal(buildReminderComingUp(twoToday, 'en', { localHour: 19 }),
    'Deadline Wednesday: Quarterly tax declaration and invoice deadline.')
})

test('all medium insight text must be accepted by the enlarged firmware buffer', () => {
  const fw = readFileSync(new URL('../frame/src/modules/ModuleReminders.cpp', import.meta.url), 'utf8')
  assert.match(fw, /char comingUp\[180\]/)
  assert.match(fw, /char work\[240\]/)
  assert.match(fw, /REMINDERS_MAX_BODY_BYTES = 4608/)
  assert.match(fw, /static_assert\(sizeof\(ReminderCache\) <= 4096/)
})
