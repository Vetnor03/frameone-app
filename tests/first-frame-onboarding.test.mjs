import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const setup = home.slice(home.indexOf('function FrameSetupFlow({'), home.indexOf('function FirstFrameOnboarding({'))

test('fresh frame onboarding uses the product module order', () => {
  assert.match(setup, /\['date', 'reminders', 'weather', 'countdown'\] as const/)
})

test('all optional pages advance without requiring input', () => {
  assert.match(setup, /async function advance\(\)/)
  assert.doesNotMatch(setup, /setupModuleComplete|requiredModules|disabled=\{!setupModuleComplete/)
})

test('AI Follow is not part of first-time setup', () => {
  assert.doesNotMatch(setup, /AI Follow|create_ai_assistant_watch|get_ai_subscription_entitlements/)
})

test('normal completion creates four unpinned dashboard modules', () => {
  assert.match(home, /0: 'date', 1: 'reminders', 2: 'weather', 3: 'countdown'/)
  assert.match(home, /let nextPinnedTabs: ModuleKey\[\] = \[\]/)
})
