import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const start = source.indexOf('function FrameSetupFlow(')
const end = source.indexOf('function FirstFrameOnboarding(', start)
assert.ok(start >= 0 && end > start, 'FrameSetupFlow exists')
const onboarding = source.slice(start, end)

test('Normal onboarding has Weather then optional Connect Apps, no news page or weather preview', () => {
  assert.match(onboarding, /const guidedModules = \['weather'\] as const/)
  assert.match(onboarding, /progressTotal = purpose === 'normal' \? guidedModules\.length \+ 1 : 2/)
  assert.match(onboarding, /setStep\('connect'\)/)
  assert.doesNotMatch(onboarding, /<NewsModuleSettingsTab/)
  assert.match(onboarding, /showDetails=\{false\} onPicked=/)
  assert.match(onboarding, /disabled=\{saving \|\| \(current === 'weather' && !weatherLocationChosen\)\}/)
})

test('Custom setup must visit the same Connect step', () => {
  assert.match(onboarding, /if \(customSelection\.valid\) \{ setError\(null\); setStep\('connect'\) \}/)
  assert.doesNotMatch(onboarding, /finish\('custom'\)/)
  assert.match(onboarding, /if \(step === 'connect'\) return shell/)
  assert.match(onboarding, /onClick=\{\(\) => finish\(purpose\)\}/)
})

test('Back navigation and progress both handle the new shared step', () => {
  assert.match(onboarding, /if \(step === 'connect'\)/)
  assert.match(onboarding, /if \(purpose === 'custom'\) setStep\('custom'\)/)
  assert.match(onboarding, /progressCurrent.*progressTotal/)
  assert.match(onboarding, /savedDraft\?\.step === 'connect'/)
})

test('Skipping is explicit and setup waits for provider discovery and OAuth return', () => {
  assert.match(onboarding, /Skip for now & finish/)
  assert.match(onboarding, /connectionsChecking/)
  assert.match(onboarding, /disabled=\{saving \|\| connectionsChecking\}/)
  assert.match(onboarding, /onOnboardingConnectionCheckChange=\{setConnectionsChecking\}/)
  assert.match(source, /pendingGoogleEnableAfterOAuth && !googleStatusFailed/)
  assert.match(source, /pendingTeamsEnableAfterOAuth && !teamsStatusFailed/)
  assert.match(source, /!googleStatusResolved && !googleStatusFailed/)
  assert.match(source, /!teamsStatusResolved && !teamsStatusFailed/)
})

test('Onboarding offers working integrations plus experimental Spond, but hides unavailable providers', () => {
  const catalogue = readFileSync(new URL('../app/lib/integrations/catalog.ts', import.meta.url), 'utf8')
  assert.match(source, /INTEGRATION_CATALOGUE\.filter\(definition => !startup \|\| \(definition\.connectable && \(definition\.status === 'available' \|\| definition\.key === 'spond'\)\)\)/)
  assert.match(catalogue, /key: 'spond'[^\n]*status: 'experimental', connectable: true/)
  assert.match(source, /app\.status === 'experimental' && <span/)
  assert.match(source, /\.\.\.dynamicTabs,\s*\{ key: 'connect'/)
})


test('Normal preset uses NRK Top Stories and News remains configurable after setup', () => {
  const completion = source.slice(source.indexOf('  async function completeFrameSetup('), source.indexOf('  async function customLayoutRequest('))
  assert.match(completion, /nextModules\.news = \{ \.\.\.savedNews, feed: 'top' \}/)
  assert.match(source, /if \(module === 'news'\) \{[\s\S]*?return <NewsModuleSettingsTab/)
})

test('weather location picker can open, select and close without showing forecast details', () => {
  const row = source.slice(source.indexOf('function WeatherLocationRow('), source.indexOf('function CustomSurfSpotWizard(', source.indexOf('function WeatherLocationRow(')))
  const sheet = source.slice(source.indexOf('function WeatherLocationSheet('), source.indexOf('function FramePreview(', source.indexOf('function WeatherLocationSheet(')))
  assert.match(row, /onClick=\{\(\) => setOpen\(true\)\}/)
  assert.match(row, /onClose=\{\(\) => setOpen\(false\)\}/)
  assert.match(row, /onPicked\(picked\)[\s\S]*?setOpen\(false\)/)
  assert.match(sheet, /geocoding-api\.open-meteo\.com/)
  assert.match(sheet, /new AbortController\(\)/)
  assert.match(sheet, /fetch\(url, \{ signal: controller\.signal \}\)/)
  assert.match(sheet, /controller\.abort\(\)/)
})

test('connect apps dialogs and OAuth routes remain wired to the onboarding flow', () => {
  const connect = source.slice(source.indexOf('function ConnectAppsScreen('), source.indexOf('function FrameSetupFlow('))
  for (const provider of ['teams', 'google-calendar', 'spond', 'local-events']) {
    assert.ok(connect.includes('/api/integrations/' + provider + '/connect'))
  }
  assert.match(connect, /onClick=\{connectSpond\}/)
  assert.match(connect, /spondModalOpen &&/)
  assert.match(connect, /localEventsOpen && renderLocalEventsModal\(\)/)
  assert.match(connect, /onClick=\{connectLocalEvents\}/)
  assert.match(connect, /initialTeamsOAuthStatus === 'connected'/)
  assert.match(connect, /initialGoogleOAuthStatus === 'connected'/)
  assert.match(connect, /changeFrameIntegration\('teams', \{ enabled: true \}\)/)
  assert.match(connect, /changeFrameIntegration\('google-calendar', \{ enabled: true \}\)/)
})
