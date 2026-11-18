import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { normalizeBonnetidDay, bonnetidLocalToIso } from '../app/lib/integrations/bonnetid/normalize.mjs'
import { buildBonnetidPrayerItems, buildIrnReminderItems } from '../app/lib/device/remindersFeed.ts'
import { isUpcomingIntegratedCalendarItem } from '../app/lib/device/calendarVisibility.ts'
import { physicalModuleDeadlines, physicalRenderDigest } from '../app/lib/device/contentSignature.mjs'

const date = '2026-11-18' // Norway winter time is UTC+01
const official = {
  fajr: '05:31',
  shuruq_sunrise: '07:43',
  duhr: '12:15',
  asr_1x_shadow: '13:30',
  asr_2x_shadow: '14:25',
  sunset: '16:31',
  maghrib: '16:32',
  isha: '18:00',
}
const settings = { powerSaver: true, cells: [{ module: 'reminders', col: 0, row: 0, w: 400, h: 240 }], modules: {} }
const rows = (method = 1) => normalizeBonnetidDay(official, date, method).map(({ name, time }) => ({
  id: name, user_id: 'tester', provider: 'bonnetid', external_id: 'city:' + date + ':' + name,
  title: name, body: null, starts_at: bonnetidLocalToIso(date, time), due_at: null, priority: 5,
  raw: { source: 'bonnetid', type: 'prayer_time', date, time, asr_method: method },
}))
const active = (now, method = 1) => buildBonnetidPrayerItems(rows(method), date, date, 'Europe/Oslo', new Date(now))

test('frame displays only remaining official Bønnetid events, including sunrise', () => {
  const items = active('2026-11-18T11:14:00Z')
  assert.deepEqual(items.map(item => item.title), ['Dhuhr', 'Asr', 'Solnedgang', 'Maghrib', 'Isha'])
  assert.deepEqual(items.map(item => item.display_time), ['12:15', '13:30', '16:31', '16:32', '18:00'])
  assert.equal(items.every(item => item.source === 'bonnetid'), true)
  assert.equal(items.every(item => item.days_until === 0), true)
  // The minute is treated as expired at 12:15, never shown until the next poll.
  assert.deepEqual(active('2026-11-18T11:15:00Z').map(item => item.title),
    ['Asr', 'Solnedgang', 'Maghrib', 'Isha'])
})

test('Power Save uses existing hard reminder boundary to wake at the next prayer', () => {
  const before = Date.parse('2026-11-18T11:14:00Z')
  const beforeItems = active(before)
  const sources = { reminders: { items: beforeItems } }
  const deadlines = physicalModuleDeadlines({ settings, sources, now: before }).reminders
  const first = deadlines.filter(item => item.reason === 'reminder_boundary')[0]
  assert.deepEqual(first, { at: Date.parse('2026-11-18T11:15:00Z'), type: 'hard', reason: 'reminder_boundary' })
  // After boundary, the filtered feed changes and the scheduler advances.
  const after = Date.parse('2026-11-18T11:15:00Z')
  const updatedSource = { reminders: { items: active(after) } }
  const next = physicalModuleDeadlines({ settings, sources: updatedSource, now: after }).reminders
    .find(item => item.reason === 'reminder_boundary')
  assert.equal(next.at, Date.parse('2026-11-18T12:30:00Z'))
  const digestBefore = physicalRenderDigest('reminders', sources.reminders, settings.cells[0], {}, before)
  const digestAfter = physicalRenderDigest('reminders', updatedSource.reminders, settings.cells[0], {}, after)
  assert.notEqual(digestBefore, digestAfter)
})

test('Asr choice changes the official frame event and its hard wake timestamp', () => {
  const now = Date.parse('2026-11-18T12:00:00Z') // 13:00 in Oslo
  const once = active(now, 1)
  const twice = active(now, 2)
  assert.equal(once.find(item => item.title === 'Asr').display_time, '13:30')
  assert.equal(twice.find(item => item.title === 'Asr').display_time, '14:25')
  for (const [method, expected] of [[1, '2026-11-18T12:30:00Z'], [2, '2026-11-18T13:25:00Z']]) {
    const deadlines = physicalModuleDeadlines({ settings, sources: { reminders: { items: active(now, method) } }, now }).reminders
    assert.equal(deadlines.find(item => item.reason === 'reminder_boundary').at, Date.parse(expected))
  }
})

test('app Bønn filter removes the expired prayer at the minute boundary, not other sources', () => {
  assert.equal(isUpcomingIntegratedCalendarItem('bonnetid', date, '12:15', date, '12:14'), true)
  assert.equal(isUpcomingIntegratedCalendarItem('bonnetid', date, '12:15', date, '12:15'), false)
  assert.equal(isUpcomingIntegratedCalendarItem('bonnetid', date, '12:15', date, '12:16'), false)
  assert.equal(isUpcomingIntegratedCalendarItem('bonnetid', '2026-11-19', '05:00', date, '23:59'), true)
  assert.equal(isUpcomingIntegratedCalendarItem('remind', date, '12:15', date, '12:16'), true)
})

test('existing firmware smart schedule handles prayer boundaries without an extra polling mode', () => {
  const firmware = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')
  const smart = readFileSync(new URL('../frame/src/core/SmartRefresh.cpp', import.meta.url), 'utf8')
  const requestPlan = readFileSync(new URL('../app/lib/device/contentSignatureBase.mjs', import.meta.url), 'utf8')
  assert.match(firmware, /SmartRefresh::dueModuleCsv\(g_smartState, time\(nullptr\)\)/)
  assert.match(firmware, /SmartRefresh::secondsUntilNextWake/)
  assert.match(smart, /deadline\.at < next/)
  assert.match(requestPlan, /reminderBoundaries\(sources\[ref\.key\], now\)/)
  assert.match(requestPlan, /\/api\/device\/reminders/)
})

test('physical frame preserves exact official prayer names without AI rewriting', () => {
  const route = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  assert.match(route, /optimizerItems = selectedItems\.map\([\s\S]*?\.filter\(\(item\) => item\.source !== 'bonnetid'\)/)
  assert.match(route, /primaryTitles\.get\(index\) \|\| item\.title/)
})

test('IRN source accepts official holidays and retains all-day items until tomorrow', () => {
  const holiday = {
    id: 'h1', user_id: 'tester', provider: 'bonnetid', external_id: 'holiday:official-id',
    title: 'Offisiell høytid', body: null, starts_at: null, due_at: null, priority: 5,
    raw: { source: 'bonnetid', type: 'holiday', date: '2026-11-18', all_day: true },
  }
  const tonight = buildIrnReminderItems([holiday], date, date, 'Europe/Oslo', new Date('2026-11-18T21:00:00Z'))
  assert.deepEqual(tonight.map(item => item.title), ['Offisiell høytid'])
  assert.equal(tonight[0].is_all_day, true)
  assert.equal(tonight[0].display_time, null)
  assert.equal(tonight[0].source, 'bonnetid')
  const tomorrow = buildIrnReminderItems([holiday], '2026-11-19', '2026-11-20', 'Europe/Oslo', new Date('2026-11-19T12:00:00Z'))
  assert.deepEqual(tomorrow, [])
})

test('IRN events and prayers share their source but timed events expire precisely', () => {
  const event = {
    id: 'e1', user_id: 'tester', provider: 'bonnetid', external_id: 'event:official-id',
    title: 'Arrangement', body: null, starts_at: '2026-11-18T17:15:00.000Z', due_at: null, priority: 5,
    raw: { source: 'bonnetid', type: 'event', date: '2026-11-18' },
  }
  assert.deepEqual(buildIrnReminderItems([event], date, date, 'Europe/Oslo', new Date('2026-11-18T17:14:59Z')).map(item => item.display_time), ['18:15'])
  assert.deepEqual(buildIrnReminderItems([event], date, date, 'Europe/Oslo', new Date('2026-11-18T17:15:00Z')), [])
})

test('calendar source label remains IRN and prayer refresh does not delete future IRN events', () => {
  const server = readFileSync(new URL('../app/lib/integrations/bonnetid/server.ts', import.meta.url), 'utf8')
  const ui = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(server, /\.filter\(row => row\.raw\?\.type === 'prayer_time'\)/)
  assert.match(ui, /if \(source === 'bonnetid'\) return 'IRN'/)
  assert.match(ui, /provider\.eq\.bonnetid/)
})
