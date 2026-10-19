import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const start = source.indexOf('function FrameSetupFlow(')
const end = source.indexOf('function FirstFrameOnboarding(', start)
assert.ok(start >= 0 && end > start, 'FrameSetupFlow exists')
const onboarding = source.slice(start, end)

test('Normal setup offers optional Connect after choosing weather and news', () => {
  assert.match(onboarding, /const guidedModules = \['weather', 'news'\]/)
  assert.match(onboarding, /if \(moduleIndex < guidedModules\.length - 1\).*setModuleIndex/)
  assert.match(onboarding, /setStep\('connect'\)/)
  assert.doesNotMatch(onboarding, /finish\('normal'\)/)
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
