import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildWasteCollectionItems } from '../app/lib/device/remindersFeed.ts'
import { wasteCachePlan } from '../app/lib/integrations/waste/cache.ts'

const row = (date, title = 'Matavfall + papir') => ({ id: date, user_id: 'u', provider: 'waste', external_id: `w:${date}`, title, starts_at: null, due_at: null, priority: 5, raw: { source: 'waste', type: 'waste_collection', date, collection_date: date, all_day: true, normalized_type: ['matavfall', 'papir'] } })

test('grouped all-day waste dates remain unchanged and show Today/Tomorrow', () => {
  const result = buildWasteCollectionItems([row('2026-03-29'), row('2026-03-30', 'Plast')], '2026-03-29', '2026-06-30', 'America/Los_Angeles', false)
  assert.equal(result.length, 2); assert.equal(result[0].title, 'Matavfall + papir'); assert.equal(result[0].occurrence_date, '2026-03-29'); assert.equal(result[0].display_date, 'Today'); assert.equal(result[1].display_date, 'Tomorrow'); assert.equal(result[0].display_time, null)
})

test('same-date grouped fractions stay one item while different dates remain separate', () => {
  const result = buildWasteCollectionItems([row('2026-10-25'), row('2026-10-26', 'Restavfall')], '2026-10-24', '2026-12-01', 'Pacific/Auckland', false)
  assert.deepEqual(result.map(x => x.occurrence_date), ['2026-10-25', '2026-10-26'])
})

test('physical frame route is cache-only and imports no waste provider or sync', () => {
  const source = fs.readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  assert.match(source, /if \(raw == null\) return true/); assert.doesNotMatch(source, /integrations\/waste|refreshWaste|syncWaste|Kartverket|MinRenovasjon|Stavanger/)
})

test('waste persistence keeps starts_at null and canonical collection_date', () => {
  const source = fs.readFileSync(new URL('../app/lib/integrations/waste/server.ts', import.meta.url), 'utf8')
  assert.match(source, /starts_at: null/); assert.match(source, /collection_date: date/); assert.doesNotMatch(source, /T00:00:00\+01:00/); assert.match(source, /Promise\.allSettled/)
})

test('failed refresh preserves cache while success identifies only stale future rows', () => {
  assert.deepEqual(wasteCachePlan(['old', 'keep'], [], false), { upsertIds: [], staleIds: [] })
  assert.deepEqual(wasteCachePlan(['old', 'keep'], ['keep', 'new', 'new'], true), { upsertIds: ['keep', 'new'], staleIds: ['old'] })
})

test('cron rejects unauthorized requests before starting synchronization', () => {
  const source = fs.readFileSync(new URL('../app/api/cron/waste-sync/route.ts', import.meta.url), 'utf8')
  assert.match(source, /status: 401/); assert.match(source, /Bearer \$\{secret\}/)
})
