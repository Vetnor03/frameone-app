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
