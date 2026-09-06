import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { physicalModuleDeadlines, physicalRenderManifest } from '../app/lib/device/contentSignature.mjs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const firmware = read('frame/src/frame_v2.5.1.ino')
const smart = read('frame/src/core/SmartRefresh.cpp')
const display = read('frame/src/display/DisplayCore.cpp')
const revisionRoute = read('app/api/device/content-revision/route.ts')
const renderRoute = read('app/api/device/render-state/route.ts')

test('cheap production revision endpoint uses only indexed ledgers with no content fan-out', () => {
  assert.match(revisionRoute, /from\('frame_content_revisions'\)/)
  assert.match(revisionRoute, /from\('frame_content_revision_changes'\)/)
  assert.doesNotMatch(revisionRoute, /contentSignature|buildFrameConfigPayload|fetch\(|weather|surf|reminders|integration/i)
})

test('unchanged firmware revision does no config, source, or display work', () => {
  const branch = firmware.slice(firmware.indexOf('!revisionState.changed'), firmware.indexOf('} else {', firmware.indexOf('!revisionState.changed')))
  assert.doesNotMatch(branch, /fetchRenderState|fetchWithStatus|renderSmartDashboard/)
})

test('changed revisions selectively request affected modules', () => {
  assert.match(firmware, /fetchRenderState\(DeviceIdentity::getToken\(\), affected/)
  assert.match(renderRoute, /requested\.has\(key\).*requested\.has\(key\.split\(':'\)\[0\]\)/s)
  assert.match(renderRoute, /settings: selectedSettings/)
})

test('real reminder/date/countdown and source deadlines are in production manifest', () => {
  const settings = { cells: [
    { module: 'reminders', col: 0, row: 0, w: 400, h: 240 },
    { module: 'date', col: 2, row: 0, w: 400, h: 240 },
    { module: 'weather:1', col: 0, row: 2, w: 400, h: 240 },
  ], modules: { weather: [{ id: 1, refresh: 600_000 }] } }
  const now = Date.parse('2026-09-06T07:05:00Z')
  const sources = { reminders: { items: [
    { occurrence_date: '2026-09-06', due_time: '10:00' },
    { occurrence_date: '2026-09-06', due_time: '15:00' },
    { occurrence_date: '2026-09-06', due_time: '16:00' },
  ] } }
  const deadlines = physicalModuleDeadlines({ settings, sources, now })
  assert.equal(deadlines.reminders.filter((d) => d.reason === 'reminder_boundary').length, 3)
  assert.ok(deadlines.reminders.every((d) => d.type === 'hard'))
  assert.equal(deadlines.date[0].type, 'hard')
  assert.equal(deadlines['weather:1'][0].type, 'soft')
  const laterAdded = { reminders: { items: [...sources.reminders.items, { occurrence_date: '2026-09-06', due_time: '17:00' }] } }
  assert.equal(physicalModuleDeadlines({ settings, sources: laterAdded, now }).reminders[0].at, deadlines.reminders[0].at)
})

test('production hashes quantize rendered weather and carry physical bounds', () => {
  const settings = { cells: [{ module: 'weather:1', col: 2, row: 2, w: 400, h: 240 }], modules: { weather: [{ id: 1 }] } }
  const first = physicalRenderManifest({ settings, sources: { 'weather:1': { temperature: 12.1 } } })[0]
  const same = physicalRenderManifest({ settings, sources: { 'weather:1': { temperature: 12.4 } } })[0]
  const changed = physicalRenderManifest({ settings, sources: { 'weather:1': { temperature: 12.6 } } })[0]
  assert.equal(first.render_hash, same.render_hash); assert.notEqual(first.render_hash, changed.render_hash)
  assert.deepEqual(first.bounds, { x: 400, y: 240, w: 400, h: 240 })
})

test('later reminder outside physical capacity changes schedule without dirtying tile', () => {
  const settings = { cells: [{ module: 'reminders', col: 0, row: 0, w: 400, h: 240 }], modules: {} }
  const items = ['10:00', '11:00', '12:00', '13:00', '14:00'].map((due_time, i) => ({ id: i, title: `R${i}`, occurrence_date: '2026-09-06', due_time }))
  const now = Date.parse('2026-09-06T06:00:00Z')
  const before = physicalRenderManifest({ settings, sources: { reminders: { items: items.slice(0, 4) } }, now })[0]
  const after = physicalRenderManifest({ settings, sources: { reminders: { items } }, now })[0]
  assert.equal(before.render_hash, after.render_hash)
  assert.ok(after.deadlines.length > before.deadlines.length)
})

test('firmware uses actual partial windows and full windows only by plan', () => {
  assert.match(display, /display\.setPartialWindow\(x, y, w, h\)/)
  assert.match(smart, /SmartDisplayPlan::PARTIAL/)
  assert.match(firmware, /drawRegionWithContent/)
  assert.match(firmware, /plan\.type == SmartDisplayPlan::FULL/)
  assert.ok(smart.indexOf('commitSuccessfulDisplay') > smart.indexOf('SmartRefresh::plan'))
})

test('manual detection remains ten seconds while background safety is ten minutes', () => {
  const header = read('frame/src/core/SmartRefresh.h')
  assert.match(header, /REVISION_SAFETY_SECONDS = 10 \* 60/)
  assert.match(header, /MANUAL_PROBE_SECONDS = 10/)
  assert.match(firmware, /PROBE_WAKE_SECONDS = SmartRefresh::MANUAL_PROBE_SECONDS/)
})

test('one scheduler combines hard, soft, and revision safety deadlines', () => {
  assert.match(smart, /revisionCheckedAt \+ REVISION_SAFETY_SECONDS/)
  assert.match(smart, /deadline\.at > now && deadline\.at < next/)
  assert.match(firmware, /g_nextScheduledWake.*secondsUntilNextWake/s)
})
