import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const defaults = readFileSync(new URL('../app/lib/onboardingDefaults.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260905160000_atomic_initial_onboarding.sql', import.meta.url), 'utf8')
const builder = readFileSync(new URL('../app/api/device/frame-config/builder.ts', import.meta.url), 'utf8')
const firmware = readFileSync(new URL('../frame/src/display/ScreenPairing.cpp', import.meta.url), 'utf8')

function setupSource() {
  return home.slice(home.indexOf('function FrameSetupFlow({'), home.indexOf('function FirstFrameOnboarding({'))
}

test('first setup is exactly Date, Reminders, Weather, Countdown and excludes AI Follow', () => {
  assert.match(setupSource(), /\['date', 'reminders', 'weather', 'countdown'\] as const/)
  assert.doesNotMatch(setupSource(), /AI Follow|assistant|ai-intro|plans/)
  assert.match(setupSource(), /Continue \/ Skip/)
})

test('completion uses canonical weather and an atomic idempotent transaction', () => {
  assert.match(home, /nextModules\.weather = \[\{ \.\.\.OSLO_WEATHER \}\]/)
  assert.match(home, /complete_initial_device_onboarding/)
  assert.match(home, /pinned_tabs: nextPinnedTabs/)
  assert.match(home, /let nextPinnedTabs: ModuleKey\[\] = \[\]/)
  assert.match(migration, /primary key references public\.devices/)
  assert.match(migration, /on conflict \(device_id\) do nothing/)
  assert.match(migration, /v_claimed = 1 and not exists \(select 1 from public\.reminders/)
  assert.match(migration, /v_claimed = 1 and not exists \(select 1 from public\.countdown_events/)
})

test('starter dates use Norway rules and annual countdown rollover', () => {
  assert.match(defaults, /nthWeekdayOfMonth\(year, 2, 0, 2\)/)
  assert.match(defaults, /nthWeekdayOfMonth\(year, 11, 0, 2\)/)
  assert.match(defaults, /easterSunday\(year\)/)
  assert.match(defaults, /easter\(39\)/)
  assert.match(defaults, /easter\(50\)/)
  assert.match(defaults, /candidate = utcDate\(now\.getUTCFullYear\(\) \+ 1/)
})

test('claimed frame without canonical settings renders setup pending', () => {
  assert.match(builder, /setup_pending: true, status: 'waiting_for_setup'/)
  assert.match(firmware, /Waiting for setup/)
  assert.match(firmware, /Finish setup in the RE:MIND app/)
})

test('successful onboarding requests the normal durable device revision before leaving setup', () => {
  const completion = home.slice(home.indexOf('async function completeFrameSetup'), home.indexOf('async function customLayoutRequest'))
  assert.match(completion, /complete_initial_device_onboarding/)
  assert.match(completion, /await requestDeviceUpdate\(supabase, activeDeviceId, crypto\.randomUUID\(\)\)/)
  assert.ok(completion.indexOf('complete_initial_device_onboarding') < completion.indexOf('requestDeviceUpdate'))
  assert.ok(completion.indexOf('requestDeviceUpdate') < completion.indexOf('setSetupDeviceId(null)'))
})

test('setup-pending payload is guarded by every shared payload consumer', () => {
  const signature = readFileSync(new URL('../app/api/device/content-signature/route.ts', import.meta.url), 'utf8')
  const mirror = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
  assert.match(signature, /'setup_pending' in config/)
  assert.match(mirror, /frameConfig\.setup_pending === true/)
})

test('firmware remembers its waiting screen and skips repeat e-paper redraws', () => {
  const loop = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')
  assert.match(loop, /RTC_DATA_ATTR static bool setupPendingScreenDisplayed = false/)
  assert.match(loop, /if \(!setupPendingScreenDisplayed\)/)
  assert.match(loop, /skipping e-paper redraw/)
  assert.match(loop, /setupPendingScreenDisplayed = false/)
})

test('calendar refresh uses a rolling horizon without reconnecting', () => {
  const route = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  const teams = readFileSync(new URL('../app/lib/integrations/teams/server.ts', import.meta.url), 'utf8')
  const signature = readFileSync(new URL('../app/lib/device/contentSignature.mjs', import.meta.url), 'utf8')
  assert.match(route, /DEFAULT_HORIZON_DAYS = 120/)
  assert.match(route, /syncTeamsIfStaleForUser\(userId, \{ horizonDays \}\)/)
  assert.match(teams, /last_sync_at/)
  assert.match(teams, /syncTeamsFromStoredConnection\(userId, \{ horizonDays: options\.horizonDays \}\)/)
  assert.match(signature, /skip_sync: 0/)
  assert.match(teams, /upsert\(rows, \{ onConflict: 'user_id,provider,external_id' \}\)/)
})
