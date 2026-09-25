import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildContentRequestPlan } from '../app/lib/device/contentSignatureBase.mjs'

const surfRoute = readFileSync(new URL('../app/api/surf/score/route.ts', import.meta.url), 'utf8')
const renderStateRoute = readFileSync(new URL('../app/api/device/render-state/route.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260925060000_add_surf_frame_result_cache.sql', import.meta.url), 'utf8')

function settingsWithHiddenModules() {
  return {
    cells: [
      { slot: 0, module: 'date', col: 0, row: 0, colSpan: 4, rowSpan: 1, w: 800, h: 120, size: 'SMALL' },
      { slot: 1, module: 'surf:1', col: 0, row: 1, colSpan: 4, rowSpan: 1, w: 800, h: 120, size: 'SMALL' },
    ],
    modules: {
      surf: [{ id: 1, spot: "Today's Best", spotId: '__todays_best__', refresh: 1800000 }],
      surf_settings: { fuelPenalty: true, homeLat: 58.91, homeLon: 5.73 },
      weather: [{ id: 1, lat: 58.97, lon: 5.73 }],
      reminders: { enabled: true },
      news: { enabled: true },
      ski: [{ id: 1, lat: 59.56, lon: 7.35 }],
    },
  }
}

test('physical content plan fetches only modules active in frame cells', () => {
  const plan = buildContentRequestPlan({
    settings: settingsWithHiddenModules(),
    deviceId: 'frame-test',
    origin: 'https://re-mind.no',
  })
  assert.deepEqual(plan.requests.map((request) => request.key), ['surf:1'])
  const requestUrl = new URL(plan.requests[0].url)
  assert.equal(requestUrl.pathname, '/api/surf/score')
  assert.equal(requestUrl.searchParams.get('refresh'), null)
})

test('only scheduled Surf scope asks the Surf endpoint to refresh', () => {
  const plan = buildContentRequestPlan({
    settings: settingsWithHiddenModules(),
    deviceId: 'frame-test',
    origin: 'https://re-mind.no',
    refreshModules: new Set(['surf:1']),
  })
  const requestUrl = new URL(plan.requests[0].url)
  assert.equal(requestUrl.searchParams.get('refresh'), '1')
  assert.equal(requestUrl.searchParams.get('device_id'), 'frame-test')
})

test('physical Surf result cache persists compact output and enforces three-hour minimum refresh', () => {
  assert.match(surfRoute, /SURF_FRAME_RESULT_CACHE_MIN_REFRESH_MS = 3 \* 60 \* 60 \* 1000/)
  assert.match(surfRoute, /from\('surf_frame_result_cache'\)/)
  assert.match(surfRoute, /requestContext\.forceRefresh[\s\S]*ageMs >= SURF_FRAME_RESULT_CACHE_MIN_REFRESH_MS/)
  assert.match(surfRoute, /status: requestContext\.forceRefresh \? 'scheduled-not-due' : 'hit'/)
  assert.match(surfRoute, /writeSurfFrameResultCache\(frameCacheKey, outgoing\)/)
})

test('render-state separates requested modules from scheduled source refresh intent', () => {
  assert.match(renderStateRoute, /refresh_modules/)
  assert.match(renderStateRoute, /refreshModules,/)
})

test('Surf cache table is service-only behind RLS', () => {
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.surf_frame_result_cache from anon, authenticated/)
  assert.match(migration, /grant select, insert, update, delete on table public\.surf_frame_result_cache to service_role/)
})
