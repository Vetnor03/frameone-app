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

test('Skipping optional connection is explicit and OAuth return cannot be dropped', () => {
  assert.match(onboarding, /Skip for now & finish/)
  assert.match(onboarding, /oauthRestoring/)
  assert.match(onboarding, /disabled=\{saving \|\| oauthRestoring\}/)
  assert.match(onboarding, /onOAuthRestoringChange=\{setOauthRestoring\}/)
  assert.match(onboarding, /remind:google-oauth-device/)
  assert.match(onboarding, /remind:teams-oauth-device/)
})

test('Onboarding hides unavailable integrations but retains main Connect tab order', () => {
  assert.match(source, /INTEGRATION_CATALOGUE\.filter\(definition => !startup \|\| \(definition\.connectable && definition\.status === 'available'\)\)/)
  assert.match(source, /\.\.\.dynamicTabs,\s*\{ key: 'connect'/)
})
