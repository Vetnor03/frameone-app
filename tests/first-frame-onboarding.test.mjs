import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const remindersRoute = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
const setup = home.slice(home.indexOf('function FrameSetupFlow({'), home.indexOf('function FirstFrameOnboarding({'))
const connect = home.slice(home.indexOf('function ConnectAppsScreen({'), home.indexOf('function FrameSetupFlow({'))
const countdown = home.slice(home.indexOf('function NaturalCountdownComposer('), home.indexOf('function CountdownDraftSheet('))

test('first screen restores Normal and Custom with current recommended preset', () => {
  assert.match(setup, /\['normal', 'custom'\] as SetupPurpose\[\]/)
  assert.match(setup, /Recommended/)
  assert.match(setup, /Date, Reminders, Weather, and Countdown\./)
  assert.match(setup, /Choose your own modules and layout\./)
})

test('guided Normal setup is Reminders, Weather, Countdown only', () => {
  assert.match(setup, /guidedModules = \['reminders', 'weather', 'countdown'\] as const/)
  assert.doesNotMatch(setup, /current === 'date'/)
  assert.match(setup, /moduleIndex \+ 1} \/ {guidedModules\.length}/)
  assert.doesNotMatch(setup, /AI Follow|create_ai_assistant_watch|get_ai_subscription_entitlements/)
})

test('normal completion creates all four unpinned modules while custom stays custom', () => {
  assert.match(home, /0: 'date', 1: 'reminders', 2: 'weather', 3: 'countdown'/)
  assert.match(home, /let nextPinnedTabs: ModuleKey\[\] = \[\]/)
  assert.match(setup, /finish\('custom'\)/)
  assert.match(setup, /purpose: selectedPurpose/)
  assert.doesNotMatch(setup, /onComplete\(\{ purpose: 'normal'/)
})

test('fresh integration selection starts empty and only records explicit connects', () => {
  assert.match(setup, /integration_selection_explicit: true, integrations: \{\}/)
  assert.match(connect, /startup \? false : connectAppIsConnected/)
  assert.match(connect, /if \(!startup\) \{\s*fetchSpondStatus\(\)\s*fetchTeamsStatus\(\)/)
  assert.match(connect, /if \(!startup\) setLocalEventsSavedArea/)
  assert.match(connect, /onIntegrationConnected\?\.\('spond'/)
  assert.match(connect, /onIntegrationConnected\?\.\('local-events'/)
  assert.match(remindersRoute, /explicitIntegrationSelection/)
  assert.match(remindersRoute, /providerEnabled\('spond'\)/)
})

test('weather setup is location-only and preserves the selected configuration', () => {
  assert.match(setup, /Select location/)
  assert.doesNotMatch(setup, /Oslo is used if you skip|current temperature|sunrise|UV|precipitation|next week/i)
  assert.match(setup, /weather: \[\{ id: 1, \.\.\.picked/)
  assert.match(home, /if \(!Array\.isArray\(nextModules\.weather\) \|\| !nextModules\.weather\.length\)/)
})

test('countdown natural language parse pre-fills the manual draft and failure falls back', () => {
  assert.match(setup, /NaturalCountdownComposer/)
  assert.match(countdown, /\/api\/reminders\/parse/)
  assert.match(countdown, /title: json\.reminder\.title, date: json\.reminder\.due_date/)
  assert.match(countdown, /EDIT MANUALLY/)
  assert.match(home, /initialTitle\?: string/)
})

test('structured errors never stringify as object Object and completion remains retryable', () => {
  const formatter = home.slice(home.indexOf('function errorMessage('), home.indexOf('function isLanguage('))
  assert.match(formatter, /typeof value\.message === 'string'/)
  assert.match(formatter, /\['error', 'details', 'code'\]/)
  assert.match(formatter, /error !== '\[object Object\]'/)
  assert.match(setup, /finally \{ setSaving\(false\) \}/)
  assert.match(setup, /setError\(errorMessage/)
})
