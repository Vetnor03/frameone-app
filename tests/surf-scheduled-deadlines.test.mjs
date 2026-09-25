import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const scheduler = read('frame/src/core/SmartRefresh.cpp')
const header = read('frame/src/core/SmartRefresh.h')
const firmware = read('frame/src/frame_v2.5.1.ino')
const renderState = read('app/api/device/render-state/route.ts')
const signature = read('app/lib/device/contentSignatureBase.mjs')
const surfCache = read('app/api/device/surf-frame/route.ts')

test('an overdue saved module deadline is immediately due, not silently discarded', () => {
  const start = scheduler.indexOf('uint32_t SmartRefresh::secondsUntilNextWake')
  const end = scheduler.indexOf('String SmartRefresh::dueModuleCsv', start)
  const nextWake = scheduler.slice(start, end)
  assert.match(nextWake, /deadline\.at <= 0\) continue/)
  assert.match(nextWake, /deadline\.at <= now\) return 1/)
  assert.doesNotMatch(nextWake, /deadline\.at <= now\) continue/)
  assert.match(scheduler, /d\.at <= now \|\|\s*\(d\.type == SMART_SOFT && !newsFreshness/)
})

test('manual redraw preserves existing Surf freshness without forcing Surf requests', () => {
  assert.match(header, /preserveManualSurfFreshness/)
  const start = scheduler.indexOf('void SmartRefresh::preserveManualSurfFreshness')
  const end = scheduler.indexOf('bool SmartRefresh::saveScheduler', start)
  const preserve = scheduler.slice(start, end)
  assert.match(preserve, /current\.key\.startsWith\("surf:"\)/)
  assert.match(preserve, /previous\.modules\[j\]\.key == current\.key/)
  assert.match(preserve, /deadline\.type != SMART_SOFT/)
  assert.match(preserve, /deadline\.at > previousSoft/)
  assert.match(preserve, /deadline\.at = previousSoft/)
  const explicit = firmware.slice(firmware.indexOf('static bool fetchAndRenderExplicit'), firmware.indexOf('static bool refreshContentSignatureBestEffort'))
  assert.ok(explicit.indexOf('preserveManualSurfFreshness(g_smartState, desired)') < explicit.indexOf('mergeScheduler(g_smartState, desired, true)'))
  assert.match(explicit, /fetchRenderState\(DeviceIdentity::getToken\(\), "all", desired\)/)
  assert.doesNotMatch(explicit, /invalidateScheduled/)
})

test('only scheduled Surf checks ask backend to refresh the three-hour result cache', () => {
  assert.match(firmware, /fetchRenderState\(DeviceIdentity::getToken\(\), affected, desired, scheduledModules\)/)
  assert.match(firmware, /ModuleSurf::invalidateScheduled\(scheduledModules\)/)
  assert.match(renderState, /refreshModules = new Set/)
  assert.match(renderState, /refreshModules,/)
  assert.match(signature, /refreshSet\.has\('all'\) \|\| refreshSet\.has\('surf'\) \|\| refreshSet\.has\(ref\.key\)/)
  assert.match(surfCache, /refreshRequested && ageMs >= SURF_FRAME_RESULT_MIN_REFRESH_MS/)
})

test('failed scheduled requests have bounded retries, including after restoring overdue schedule', () => {
  assert.match(firmware, /deferFailedScheduledRefresh\(const char\* reason\)/)
  assert.match(firmware, /g_revisionRetryNotBefore = time\(nullptr\) \+ 60/)
  assert.match(firmware, /g_nextScheduledWake = g_revisionRetryNotBefore/)
  assert.match(firmware, /g_revisionRetryNotBefore > restoredNow[\s\S]*g_nextScheduledWake = g_revisionRetryNotBefore/)
  for (const reason of ['revision probe unavailable', 'config fetch failed', 'render-state fetch failed', 'physical display failed']) {
    assert.ok(firmware.includes(`deferFailedScheduledRefresh("${reason}")`))
  }
})
