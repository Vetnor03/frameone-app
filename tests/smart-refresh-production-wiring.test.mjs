import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { physicalModuleDeadlines, physicalRenderManifest } from '../app/lib/device/contentSignature.mjs'
import { affectedModulesSince } from '../app/lib/device/contentRevision.mjs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const firmware = read('frame/src/frame_v2.5.1.ino')
const smart = read('frame/src/core/SmartRefresh.cpp')
const display = read('frame/src/display/DisplayCore.cpp')
const revisionRoute = read('app/api/device/content-revision/route.ts')
const renderRoute = read('app/api/device/render-state/route.ts')
const revisionMigration = read('supabase/migrations/20260906190000_frame_content_revisions.sql')

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
    { title: 'Morning', occurrence_date: '2026-09-06', display_date: 'Today', days_until: 0, is_overdue: false, display_time: '10:00' },
    { title: 'Afternoon', occurrence_date: '2026-09-06', display_date: 'Today', days_until: 0, is_overdue: false, display_time: '15:00' },
    { title: 'Later', occurrence_date: '2026-09-06', display_date: 'Today', days_until: 0, is_overdue: false, display_time: '16:00' },
  ] } }
  const deadlines = physicalModuleDeadlines({ settings, sources, now })
  assert.equal(deadlines.reminders.filter((d) => d.reason === 'reminder_boundary').length, 3)
  assert.ok(deadlines.reminders.every((d) => d.type === 'hard'))
  assert.equal(deadlines.date[0].type, 'hard')
  assert.equal(deadlines['weather:1'][0].type, 'soft')
  const laterAdded = { reminders: { items: [...sources.reminders.items, { occurrence_date: '2026-09-06', due_time: '17:00' }] } }
  assert.equal(physicalModuleDeadlines({ settings, sources: laterAdded, now }).reminders[0].at, deadlines.reminders[0].at)
})

test('physical display_time deadlines are Europe/Oslo DST-safe', () => {
  const settings = { cells: [{ module: 'reminders', col: 0, row: 0, w: 400, h: 240 }], modules: {} }
  const summer = physicalModuleDeadlines({ settings, sources: { reminders: { items: [{ occurrence_date: '2026-09-06', display_time: '10:00' }] } }, now: Date.parse('2026-09-06T00:00:00Z') })
  const winter = physicalModuleDeadlines({ settings, sources: { reminders: { items: [{ occurrence_date: '2026-12-06', display_time: '10:00' }] } }, now: Date.parse('2026-12-06T00:00:00Z') })
  assert.equal(summer.reminders[0].at, Date.parse('2026-09-06T08:00:00Z'))
  assert.equal(winter.reminders[0].at, Date.parse('2026-12-06T09:00:00Z'))
})

test('truncated revision history conservatively invalidates all modules', () => {
  assert.deepEqual(affectedModulesSince({ since: 10, currentRevision: 200, changes: [{ revision: 136, changed_modules: ['surf'] }] }), ['all'])
  assert.deepEqual(affectedModulesSince({ since: 135, currentRevision: 136, changes: [{ revision: 136, changed_modules: ['surf'] }] }), ['surf'])
})

test('module hashes include relevant config but ignore metadata', () => {
  const base = { cells: [{ module: 'date', col: 0, row: 0, w: 400, h: 240 }], modules: { date: { country: 'NO', updated_at: 'old' } }, language: 'en' }
  const source = { date: '2026-09-06' }
  const english = physicalRenderManifest({ settings: base, sources: source })[0].render_hash
  const norwegian = physicalRenderManifest({ settings: { ...base, language: 'no' }, sources: source })[0].render_hash
  const metadata = physicalRenderManifest({ settings: { ...base, modules: { date: { country: 'NO', updated_at: 'new' } } }, sources: source })[0].render_hash
  assert.notEqual(english, norwegian); assert.equal(english, metadata)
  const weatherSettings = (units, hiLo) => ({ cells: [{ module: 'weather:1', col: 0, row: 0, w: 400, h: 240 }], modules: { weather: [{ id: 1, units, hiLo }] } })
  assert.notEqual(physicalRenderManifest({ settings: weatherSettings('metric', true), sources: { 'weather:1': { temperature: 12 } } })[0].render_hash,
    physicalRenderManifest({ settings: weatherSettings('imperial', false), sources: { 'weather:1': { temperature: 12 } } })[0].render_hash)
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

test('connected manual detection remains ten seconds while true deep sleep is dynamic', () => {
  const header = read('frame/src/core/SmartRefresh.h')
  assert.match(header, /REVISION_SAFETY_SECONDS = 10 \* 60/)
  assert.match(header, /MANUAL_PROBE_SECONDS = 10/)
  assert.match(firmware, /BATTERY_CONNECTED_IDLE_LOOP_MS = 10000/)
  assert.match(firmware, /nextDeepSleepDurationUs[\s\S]*secondsUntilNextWake/)
  assert.doesNotMatch(firmware, /PROBE_WAKE_US|PROBE_WAKE_SECONDS/)
  assert.match(firmware, /enablePowerSenseWakeForNextSleep\(usbPresent\)/)
})

test('unchanged revision rebases and persists scheduler progress without display work', () => {
  const branch = firmware.slice(firmware.indexOf('} else if (!revisionState.changed'), firmware.indexOf('} else {', firmware.indexOf('} else if (!revisionState.changed')))
  assert.match(branch, /g_revisionCheckedAt = time\(nullptr\)/)
  assert.match(branch, /secondsUntilNextWake/)
  assert.match(branch, /saveScheduler\(g_smartState, g_revisionCheckedAt\)/)
  assert.doesNotMatch(branch, /fetchRenderState|ensureDisplay|renderSmartDashboard|commitSuccessfulDisplay|sourceSucceeded/)
})

test('one scheduler combines hard, soft, and revision safety deadlines', () => {
  assert.match(smart, /revisionCheckedAt \+ REVISION_SAFETY_SECONDS/)
  assert.match(smart, /deadline\.at > now && deadline\.at < next/)
  assert.match(firmware, /g_nextScheduledWake.*secondsUntilNextWake/s)
})

test('user-scoped integration and Surf mutations resolve physical membership ids', () => {
  assert.match(revisionMigration, /bump_integration_frame_content[\s\S]*select dm\.device_id from public\.device_members dm where dm\.user_id = owner/)
  assert.match(revisionMigration, /bump_user_surf_frame_content[\s\S]*select distinct dm\.device_id from public\.device_members dm where dm\.user_id = owner/)
  assert.doesNotMatch(revisionMigration, /device_members dm on dm\.device_id = d\.id/)
  assert.match(revisionMigration, /array\['integration_items','user_integrations'\]/)
})

test('firmware persists, restores, merges, and unions complete scheduler metadata', () => {
  assert.match(smart, /saveScheduler[\s\S]*putString\("schedule"/)
  assert.match(smart, /loadScheduler[\s\S]*getString\("schedule"/)
  assert.match(smart, /mergeScheduler[\s\S]*complete\.modules\[destination\] = update\.modules\[i\]/)
  assert.match(firmware, /loadScheduler\(g_smartState, g_revisionCheckedAt\)/)
  assert.match(firmware, /unionModuleCsv\(revisionState\.affectedModules, scheduledModules\)/)
})

test('partial renderer restores full-render chrome through the same module dispatcher', () => {
  const layout = read('frame/src/core/Layout.cpp')
  assert.match(layout, /drawRegionWithContent[\s\S]*ModuleRenderer::renderPlaceholders/)
  assert.match(layout, /drawRegionWithContent[\s\S]*drawHLine[\s\S]*drawVLine/)
  assert.match(layout, /drawRegionWithContent[\s\S]*DisplayCore::drawBatteryOverlay/)
})

test('manual screen-wide evaluation rebases nearby soft work from completion time', () => {
  const settings = { cells: [{ module: 'weather:1', col: 0, row: 0, w: 400, h: 240 }], modules: { weather: [{ id: 1, refresh: 600_000 }] } }
  const manualAt = Date.parse('2026-09-06T08:00:00Z')
  const refreshed = physicalModuleDeadlines({ settings, sources: {}, now: manualAt })
  assert.equal(refreshed['weather:1'][0].at, manualAt + 600_000)
  assert.match(firmware, /fetchRenderState\(DeviceIdentity::getToken\(\), "all", desired\)/)
  assert.match(firmware, /mergeScheduler\(g_smartState, desired, true\)/)
})
