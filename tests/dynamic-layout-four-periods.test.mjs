import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  dynamicPeriodAt, nextDynamicTransitionAt, normalizeDynamicLayout,
  resolveDynamicFrameSettings,
} from '../app/lib/device/dynamicLayout.mjs'

const config = (choices, timezone = 'Europe/Oslo') => ({
  enabled: true, timezone,
  periods: Object.fromEntries(['morning', 'afternoon', 'evening', 'night']
    .map((period, index) => [period, { layout: 'pyramid', cells: [{ slot: 0, module: choices[index] }] }])),
})

test('legacy settings do not activate Dynamic Layout', () => {
  const legacy = { layout: 'pyramid', cells: [{ slot: 0, module: 'date' }] }
  assert.deepEqual(resolveDynamicFrameSettings(legacy).settings, legacy)
  assert.equal(resolveDynamicFrameSettings(legacy).nextTransitionAt, 0)
})

test('four periods are selected by frame-local time, including across midnight', () => {
  const timezone = 'Europe/Oslo'
  assert.equal(dynamicPeriodAt(Date.parse('2026-11-18T05:30:00Z'), timezone), 'morning')
  assert.equal(dynamicPeriodAt(Date.parse('2026-11-18T11:30:00Z'), timezone), 'afternoon')
  assert.equal(dynamicPeriodAt(Date.parse('2026-11-18T16:30:00Z'), timezone), 'evening')
  assert.equal(dynamicPeriodAt(Date.parse('2026-11-18T22:30:00Z'), timezone), 'night')
})

test('changing a single period does not mutate the other three', () => {
  const now = Date.parse('2026-11-18T09:00:00Z')
  const stored = { layout: 'default', cells: [], dynamic_layout: config(['news','news','surf','news']) }
  const before = resolveDynamicFrameSettings(stored, now)
  assert.equal(before.settings.cells[0].module, 'news')
  const after = resolveDynamicFrameSettings(stored, Date.parse('2026-11-18T18:00:00Z'))
  assert.equal(after.settings.cells[0].module, 'surf')
  assert.equal('dynamic_layout' in after.settings, false)
})

test('identical layouts skip all four extra physical wakeups', () => {
  const normalized = normalizeDynamicLayout(config(['news','news','news','news']))
  assert.equal(nextDynamicTransitionAt(normalized, Date.parse('2026-11-18T08:00:00Z')), 0)
})

test('next transition skips identical adjacent periods', () => {
  const normalized = normalizeDynamicLayout(config(['news','news','surf','surf']))
  const now = Date.parse('2026-11-18T09:11:00Z')
  assert.equal(new Date(nextDynamicTransitionAt(normalized, now) * 1000).toISOString(), '2026-11-18T16:00:00.000Z')
})

test('DST transitions keep local morning/evening boundaries correct', () => {
  const normalized = normalizeDynamicLayout(config(['date','date','surf','surf']))
  // Norwegian clocks move forward on 29 March 2026; evening still starts at 17:00 CEST.
  const now = Date.parse('2026-03-29T09:00:00Z')
  assert.equal(new Date(nextDynamicTransitionAt(normalized, now) * 1000).toISOString(), '2026-03-29T15:00:00.000Z')
})

test('UI keeps existing app tabs and features a slider plus side-by-side toggles', () => {
  const source = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(source, /onDynamicPeriodChange/)
  assert.match(source, /onDynamicLayoutToggle/)
  assert.match(source, /grid grid-cols-4/)
  assert.match(source, /gap-x-4 gap-y-2/)
  assert.match(source, /<TabBar/)
})
