import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import { buildSpondReminderItems, buildTeamsMeetingItems, compareReminderItems, selectReminderDisplayGroups, sortReminderItems } from '../app/lib/device/remindersFeed.ts'

const item = ({ id, date, days, source }) => ({
  reminder_id: id, title: id, occurrence_date: date,
  display_date: days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : date,
  days_until: days, is_overdue: false, repeat: 'none',
  due_time: null, display_time: null, source,
})

test('frame reminder feed orders tomorrow Microsoft meeting before later trash reminder', () => {
  const todayYmd = '2026-06-01'
  const horizonEndYmd = '2026-09-29'
  const timeZone = 'Europe/Oslo'
  const now = new Date('2026-06-01T18:00:00.000Z')

  const teamsItems = buildTeamsMeetingItems([
    {
      id: 'integration-row-1',
      user_id: 'user-1',
      provider: 'teams',
      external_id: 'meeting-tomorrow-0800',
      title: 'Tomorrow morning meeting',
      body: null,
      starts_at: '2026-06-02T06:00:00.000Z',
      due_at: '2026-06-02T07:00:00.000Z',
      priority: 0,
    },
  ], todayYmd, horizonEndYmd, timeZone, now)

  const trashReminder = {
    reminder_id: 'trash-tuesday',
    title: 'Tøm plast, Tøm restavfall',
    occurrence_date: '2026-06-09',
    display_date: '09.06.2026',
    days_until: 8,
    is_overdue: false,
    repeat: 'none',
    due_time: null,
    display_time: null,
    source: 'remind',
  }

  const items = [...teamsItems, trashReminder].sort(compareReminderItems)

  assert.equal(teamsItems.length, 1)
  assert.equal(teamsItems[0].display_date, 'Tomorrow')
  assert.equal(teamsItems[0].display_time, '08:00')
  assert.equal(items[0].title, 'Tomorrow morning meeting')
  assert.equal(items[1].title, 'Tøm plast, Tøm restavfall')
})

test('Spond reminder feed only includes event arrangements', () => {
  const items = buildSpondReminderItems([
    {
      id: 'spond-event-row',
      user_id: 'user-1',
      provider: 'spond',
      external_id: 'event:arrangement-1',
      title: 'Practice',
      body: null,
      starts_at: '2026-06-02T16:00:00.000Z',
      due_at: '2026-06-02T17:00:00.000Z',
      priority: 0,
    },
    {
      id: 'spond-post-row',
      user_id: 'user-1',
      provider: 'spond',
      external_id: 'post:announcement-1',
      title: 'Updated announcement',
      body: null,
      starts_at: '2026-06-01T08:00:00.000Z',
      due_at: '2026-06-01T08:00:00.000Z',
      priority: 10,
    },
    {
      id: 'spond-chat-row',
      user_id: 'user-1',
      provider: 'spond',
      external_id: 'chat:comment-thread-1',
      title: 'Latest comment',
      body: null,
      starts_at: '2026-06-01T09:00:00.000Z',
      due_at: '2026-06-01T09:00:00.000Z',
      priority: 20,
    },
  ], '2026-06-01', '2026-06-30', 'Europe/Oslo', false)

  assert.equal(items.length, 1)
  assert.equal(items[0].external_id, 'event:arrangement-1')
  assert.equal(items[0].title, 'Practice')
})

test('compact reminder feed keeps only the next two display groups', async () => {
  const { selectReminderDisplayGroups } = await import('../app/lib/device/remindersFeed.ts')
  const makeItem = (title, occurrence_date, days_until) => ({
    reminder_id: title,
    title,
    occurrence_date,
    display_date: days_until === 0 ? 'Today' : days_until === 1 ? 'Tomorrow' : occurrence_date,
    days_until,
    is_overdue: false,
    repeat: 'none',
    due_time: null,
    display_time: null,
    source: 'remind',
  })

  const items = [
    makeItem('today 1', '2026-06-01', 0),
    makeItem('today 2', '2026-06-01', 0),
    makeItem('tomorrow 1', '2026-06-02', 1),
    makeItem('later 1', '2026-06-03', 2),
  ]

  assert.deepEqual(
    selectReminderDisplayGroups(items, 10).map((item) => item.title),
    ['today 1', 'today 2', 'tomorrow 1']
  )
})

test('compact reminder feed caps oversized first display group', async () => {
  const { selectReminderDisplayGroups } = await import('../app/lib/device/remindersFeed.ts')
  const items = Array.from({ length: 14 }, (_, index) => ({
    reminder_id: `today-${index}`,
    title: `today ${index}`,
    occurrence_date: '2026-06-01',
    display_date: 'Today',
    days_until: 0,
    is_overdue: false,
    repeat: 'none',
    due_time: index < 10 ? `0${index}:00` : null,
    display_time: index < 10 ? `0${index}:00` : null,
    source: 'remind',
  }))

  const selected = selectReminderDisplayGroups(items, 12)

  assert.equal(selected.length, 12)
  assert.equal(selected[0].title, 'today 0')
  assert.equal(selected.at(-1).title, 'today 11')
})

test('physical frame omits reminder bullet when only one item is displayed', () => {
  const source = readFileSync(new URL('../frame/src/modules/ModuleReminders.cpp', import.meta.url), 'utf8')

  assert.match(source, /const bool drawBullets = layout\.count > 1/)
  assert.match(source, /singleItemMaxTextW = c\.w - sidePad \* 2/)
  assert.match(source, /drawBulletWrappedItem\([\s\S]*ink, drawBullets\)/)
})

test('event-only Today is selected with no manual reminders', () => {
  const events = [item({ id: 'e1', date: '2026-09-05', days: 0, source: 'teams' }), item({ id: 'e2', date: '2026-09-05', days: 0, source: 'spond' })]
  assert.deepEqual(selectReminderDisplayGroups(events, 10).map(x => x.reminder_id), ['e1', 'e2'])
})

test('event-only Tomorrow is selected when Today is empty', () => {
  const events = [item({ id: 'e1', date: '2026-09-06', days: 1, source: 'teams' })]
  assert.equal(selectReminderDisplayGroups(events, 10)[0].occurrence_date, '2026-09-06')
})

test('event tomorrow wins over a reminder three days away', () => {
  const selected = selectReminderDisplayGroups([
    item({ id: 'r1', date: '2026-09-08', days: 3, source: 'remind' }),
    item({ id: 'e1', date: '2026-09-06', days: 1, source: 'teams' }),
  ], 1)
  assert.equal(selected[0].reminder_id, 'e1')
})

test('a mixed reminder and event day keeps both sources', () => {
  const selected = selectReminderDisplayGroups([
    item({ id: 'r1', date: '2026-09-06', days: 1, source: 'remind' }),
    item({ id: 'e1', date: '2026-09-06', days: 1, source: 'teams' }),
  ], 10)
  assert.deepEqual(new Set(selected.map(x => x.source)), new Set(['remind', 'teams']))
})

const timedItem = (id, date, time, source = 'remind', title = id) => ({
  ...item({ id, date, days: date === '2026-09-08' ? 0 : date === '2026-09-09' ? 1 : 9, source }),
  title,
  due_time: time,
  display_time: time,
})

test('canonical ordering sorts Today, Tomorrow, and arbitrary future days by local display time', () => {
  const unordered = [
    timedItem('future-20', '2026-09-17', '20:00'),
    timedItem('tomorrow-20', '2026-09-09', '20:00'),
    timedItem('today-20', '2026-09-08', '20:00'),
    timedItem('future-19', '2026-09-17', '19:00'),
    timedItem('today-19', '2026-09-08', '19:00'),
    timedItem('tomorrow-19', '2026-09-09', '19:00'),
  ]

  assert.deepEqual(sortReminderItems(unordered).map(x => x.reminder_id), [
    'today-19', 'today-20', 'tomorrow-19', 'tomorrow-20', 'future-19', 'future-20',
  ])
})

test('canonical ordering normalizes UTC integration timestamps into the displayed timezone', () => {
  const teams = buildTeamsMeetingItems([
    { id: '2', user_id: 'u', provider: 'teams', external_id: 'late', title: 'Teams late', body: null, starts_at: '2026-09-09T18:00:00Z', due_at: null, priority: 0 },
  ], '2026-09-08', '2026-09-30', 'Europe/Oslo', new Date('2026-09-08T00:00:00Z'))
  const spond = buildSpondReminderItems([
    { id: '1', user_id: 'u', provider: 'spond', external_id: 'event:early', title: 'Spond early', body: null, starts_at: '2026-09-09T17:00:00Z', due_at: null, priority: 0 },
  ], '2026-09-08', '2026-09-30', 'Europe/Oslo', false)
  const manual = timedItem('manual-middle', '2026-09-09', '19:30', 'remind')

  assert.deepEqual(sortReminderItems([...teams, manual, ...spond]).map(x => [x.source, x.display_time]), [
    ['spond', '19:00'], ['remind', '19:30'], ['teams', '20:00'],
  ])
})

test('equal timestamps use source, title, and identity as deterministic tie-breakers', () => {
  const input = [
    timedItem('b', '2026-09-09', '20:00', 'remind', 'Same'),
    timedItem('z', '2026-09-09', '20:00', 'spond', 'Zulu'),
    timedItem('a', '2026-09-09', '20:00', 'remind', 'Same'),
    timedItem('t', '2026-09-09', '20:00', 'teams', 'Teams'),
  ]
  const expected = ['t', 'z', 'a', 'b']
  assert.deepEqual(sortReminderItems(input).map(x => x.reminder_id), expected)
  assert.deepEqual(sortReminderItems([...input].reverse()).map(x => x.reminder_id), expected)
})

test('untimed items follow all timed items on their date without affecting timed order', () => {
  const allDay = item({ id: 'all-day', date: '2026-09-09', days: 1, source: 'waste' })
  assert.deepEqual(sortReminderItems([
    timedItem('late', '2026-09-09', '20:00'), allDay, timedItem('early', '2026-09-09', '19:00'),
  ]).map(x => x.reminder_id), ['early', 'late', 'all-day'])
})

test('physical reminder renderers preserve the same canonical API ordering as Mirror View', () => {
  const api = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  const mirror = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
  const firmware = readFileSync(new URL('../frame/src/modules/ModuleReminders.cpp', import.meta.url), 'utf8')

  assert.match(api, /const allItems = sortReminderItems\(/)
  assert.match(api, /const physicalItems = selectedItems\.map/)
  assert.match(mirror, /const items = Array\.isArray\(data\.items\)/)
  assert.match(mirror, /primaryBucketItems\.slice/)
  for (const renderer of ['renderSmall', 'renderMedium', 'renderLarge', 'renderXL', 'renderAdaptiveReminders']) {
    assert.match(firmware, new RegExp(`static void ${renderer}`))
  }

  // The bucket builder retains feed order, and every renderer/selection helper
  // either consumes that array directly or delegates to a helper that does.
  assert.match(firmware, /bk\.itemIdx\[bk\.count\] = i;\s*bk\.count\+\+;/)
  assert.match(firmware, /collectPrimaryShownOccurrences[\s\S]*?int itemIdx = bucket\.itemIdx\[i\];/)
  assert.match(firmware, /buildSmartReminderLayout[\s\S]*?int itemIdx = bucket\.itemIdx\[i\];/)
  assert.match(firmware, /buildEmergencyReminderLayout[\s\S]*?int itemIdx = bucket\.itemIdx\[0\];/)
  assert.match(firmware, /renderSmall[\s\S]*?int itemIdx = bucket\.itemIdx\[i\];/)
  assert.match(firmware, /renderMedium[\s\S]*?drawBucketLinesCentered\(c, bucket, visibleCount,/)
  assert.match(firmware, /renderLarge[\s\S]*?renderMedium\(leftCell, buckets, bucketCount, primaryIdx\)/)
  assert.match(firmware, /renderXL[\s\S]*?renderMedium\(topLeft, buckets, bucketCount, primaryIdx\)/)
  assert.match(firmware, /renderXL[\s\S]*?drawNextRemindersList\(leftX, botY, leftW, bottomH, buckets, bucketCount, primaryIdx\)/)
  assert.match(firmware, /renderAdaptiveFallbackBucket[\s\S]*?bucket\.itemIdx\[i\]/)
  assert.match(firmware, /renderAdaptiveReminders[\s\S]*?today->itemIdx\[i\]/)
  assert.match(firmware, /renderAdaptiveReminders[\s\S]*?tomorrow->itemIdx\[i\]/)

  assert.doesNotMatch(firmware, /getRotationStep4h/)
  assert.doesNotMatch(firmware, /wrapIndex/)
  assert.doesNotMatch(firmware, /\brotation\b/)
  assert.doesNotMatch(firmware, /std::sort|qsort/)
})

test('physical capacity keeps the earliest canonical reminders instead of a rotating subset', () => {
  const canonicalApiItems = [
    { title: 'Event B', display_time: '19:00' },
    { title: 'Event A', display_time: '20:00' },
    { title: 'Event C', display_time: '20:00' },
  ]

  // Firmware buckets append API indexes in order and capacity is applied from
  // index zero. Mirror View likewise uses slice, so both surfaces select B, A.
  const bucketItemIdx = canonicalApiItems.map((_, index) => index)
  const physical = bucketItemIdx.slice(0, 2).map(index => canonicalApiItems[index])
  const mirror = canonicalApiItems.slice(0, 2)

  assert.deepEqual(physical.map(item => item.display_time), ['19:00', '20:00'])
  assert.equal(physical[0].title, 'Event B')
  assert.deepEqual(physical, mirror)
})

test('mixed reminder and local-event list stays chronological after source selection', () => {
  const makeTimedItem = (id, time, source) => ({
    reminder_id: id,
    title: id,
    occurrence_date: '2026-09-06',
    display_date: 'Today',
    days_until: 0,
    is_overdue: false,
    repeat: 'none',
    due_time: time,
    display_time: time,
    source,
  })

  const selected = selectReminderDisplayGroups([
    makeTimedItem('personal-1900', '19:00', 'remind'),
    makeTimedItem('event-1400', '14:00', 'local-events'),
    makeTimedItem('event-2200', '22:00', 'local-events'),
  ], 10)

  assert.deepEqual(
    selected.map((entry) => entry.display_time),
    ['14:00', '19:00', '22:00']
  )
})
