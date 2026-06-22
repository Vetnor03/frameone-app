import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWasteCollectionItems, compareReminderItems } from '../app/lib/device/remindersFeed.ts'
import { wasteCollectionTitle } from '../app/lib/integrations/waste/providers.ts'

test('waste collection items are all-day reminders without display time', () => {
  const items = buildWasteCollectionItems([
    {
      id: '1', user_id: 'u1', provider: 'waste', external_id: 'stavanger:1103:a1:plast:2026-06-22',
      title: 'Tøm plast', body: null, starts_at: '2026-06-22T00:00:00+01:00', due_at: '2026-06-22T00:00:00+01:00', priority: 5,
      raw: { source: 'waste', type: 'waste_collection', waste_fraction: 'plast', date: '2026-06-22', all_day: true },
    },
  ], '2026-06-21', '2026-07-21', 'Europe/Oslo', false)
  assert.equal(items.length, 1)
  assert.equal(items[0].source, 'waste')
  assert.equal(items[0].title, 'Tøm plast')
  assert.equal(items[0].display_time, null)
  assert.equal(items[0].due_time, null)
  assert.equal(items[0].occurrence_date, '2026-06-22')
})

test('waste collection builder deduplicates same fraction and date from multiple provider rows', () => {
  const base = {
    id: '1', user_id: 'u1', provider: 'waste', title: 'Tøm papir', body: null, starts_at: '2026-06-23T00:00:00+01:00', due_at: null, priority: 5,
    raw: { source: 'waste', type: 'waste_collection', waste_fraction: 'papir', date: '2026-06-23' },
  }
  const items = buildWasteCollectionItems([
    { ...base, external_id: 'min_renovasjon:1103:a1:papir:2026-06-23' },
    { ...base, id: '2', external_id: 'generic_ics:1103:a1:papir:2026-06-23' },
  ], '2026-06-21', '2026-07-21', 'Europe/Oslo', false)
  assert.equal(items.length, 1)
})

test('waste collection sorting follows normal date order with no time', () => {
  const waste = buildWasteCollectionItems([
    { id: 'w', user_id: 'u1', provider: 'waste', external_id: 'waste:1', title: 'Tøm restavfall', body: null, starts_at: '2026-06-24T00:00:00+01:00', due_at: null, priority: 5, raw: { source: 'waste', type: 'waste_collection', waste_fraction: 'restavfall', date: '2026-06-24' } },
  ], '2026-06-21', '2026-07-21', 'Europe/Oslo', false)[0]
  const manual = { reminder_id: 'm', title: 'Manual', occurrence_date: '2026-06-22', display_date: 'Tomorrow', days_until: 1, is_overdue: false, repeat: 'none', due_time: '12:00', display_time: '12:00', source: 'remind' }
  assert.deepEqual([waste, manual].sort(compareReminderItems).map((x) => x.reminder_id), ['m', 'waste:waste:1'])
})

test('Norwegian waste titles are normalized by fraction', () => {
  assert.equal(wasteCollectionTitle('restavfall'), 'Tøm restavfall')
  assert.equal(wasteCollectionTitle('plast'), 'Tøm plast')
  assert.equal(wasteCollectionTitle('papir'), 'Tøm papir')
  assert.equal(wasteCollectionTitle('matavfall'), 'Tøm matavfall')
  assert.equal(wasteCollectionTitle('glass_metall'), 'Tøm glass og metall')
})
