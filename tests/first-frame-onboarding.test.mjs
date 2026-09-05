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
  assert.match(setup, /await onComplete\(\{ purpose: selectedPurpose, modules \}\)/)
})

test('fresh integration selection starts empty and only records explicit connects', () => {
  assert.match(setup, /integration_selection_explicit: true, integrations: \{ \.\.\.\(savedDraft\?\.modules\?\.integrations \|\| \{\}\) \}/)
  assert.match(connect, /frameUsesIntegration\(modulesJson, 'spond'\)/)
  assert.match(connect, /setSpondAccountConnected/)
  assert.match(connect, /if \(frameUsesIntegration\(modulesJson, 'local-events'\)\) setLocalEventsSavedArea/)
  assert.match(connect, /changeFrameIntegration\('spond'/)
  assert.match(connect, /changeFrameIntegration\('local-events'/)
  assert.match(remindersRoute, /explicitIntegrationSelection/)
  assert.match(remindersRoute, /providerEnabled\('spond'\)/)
  assert.match(remindersRoute, /if \(!providerEnabled\('local-events'\)\) return/)
  assert.doesNotMatch(remindersRoute, /\.in\('user_id', (?:spond|teams|waste)UserIds\)/)
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


test('incomplete setup and OAuth draft survive reload while completion clears the draft', () => {
  assert.match(home, /setSetupDeviceId\(!hasSavedSettings \|\| hasOnboardingDraft \? deviceId : null\)/)
  assert.match(setup, /sessionStorage\.getItem\(`remind:onboarding:\$\{activeDeviceId\}`\)/)
  assert.match(setup, /sessionStorage\.setItem\(`remind:onboarding:\$\{activeDeviceId\}`/)
  assert.match(home, /sessionStorage\.removeItem\(`remind:onboarding:\$\{activeDeviceId\}`\)/)
  assert.match(connect, /initialTeamsOAuthStatus === 'connected'/)
})

test('account credentials and frame enablement are separate and legacy frames remain compatible', () => {
  assert.match(home, /function frameUsesIntegration/)
  assert.match(home, /integration_selection_explicit !== true.*connectAppIsConnected/)
  assert.match(connect, /Account connected · not enabled on this frame/)
  assert.match(connect, /spondAccountConnected.*changeFrameIntegration/)
  assert.match(connect, /teamsAccountConnected.*changeFrameIntegration/)
  assert.match(setup, /modulesJson=\{modules\}/)
})


test('legacy transition preserves active providers and disconnects disable frame state', () => {
  assert.match(home, /function integrationModulesAfterChange/)
  assert.match(home, /Object\.fromEntries\(legacyEnabled\.map\(provider => \[provider, \{ enabled: true \}\]\)\)/)
  assert.match(connect, /spondAccountConnected \? \['spond' as const\]/)
  assert.match(connect, /teamsAccountConnected \? \['teams' as const\]/)
  assert.match(connect, /localEventsAccountConnected \? \['local-events' as const\]/)
  assert.match(connect, /connectAppIsConnected\(modulesJson, 'waste'\)/)
  assert.match(connect, /setSpondAccountConnected\(false\)[\s\S]*changeFrameIntegration\('spond', \{ enabled: false \}\)/)
  assert.match(connect, /setTeamsAccountConnected\(false\)[\s\S]*changeFrameIntegration\('teams', \{ enabled: false \}\)/)
  assert.match(connect, /setLocalEventsAccountConnected\(false\)[\s\S]*changeFrameIntegration\('local-events', \{ enabled: false \}\)/)
})

test('settings lookup errors fail closed while valid legacy settings stay compatible', () => {
  assert.match(remindersRoute, /deviceSettingsData, error: deviceSettingsError/)
  assert.match(remindersRoute, /logOptionalReminderProviderFailure\('device_settings'/)
  assert.match(remindersRoute, /!deviceSettingsError && \(!explicitIntegrationSelection \|\|/)
  assert.match(remindersRoute, /if \(!providerEnabled\('spond'\)\) return/)
  assert.match(remindersRoute, /if \(!providerEnabled\('local-events'\)\) return/)
})

test('onboarding drafts are device scoped and cleared across authenticated users', () => {
  assert.match(setup, /remind:onboarding:\$\{activeDeviceId\}/)
  assert.match(home, /onboardingDraftUser !== session\.user\.id/)
  assert.match(home, /key\?\.startsWith\('remind:onboarding:'\)/)
  assert.match(home, /sessionStorage\.removeItem\('remind:onboarding-user'\)/)
})
