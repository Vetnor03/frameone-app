import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const subscriptions = readFileSync(new URL('../app/components/SubscriptionSettingsPage.tsx', import.meta.url), 'utf8')

function frameSetupSource() {
  return home.slice(home.indexOf('function FrameSetupFlow({'), home.indexOf('function FirstFrameOnboarding({'))
}

test('Normal is the recommended initial preset and maps to the four requested modules', () => {
  assert.match(home, /type SetupPurpose = 'normal' \| 'custom'/)
  assert.match(frameSetupSource(), /useState<SetupPurpose>\('normal'\)/)
  assert.match(frameSetupSource(), /key === 'normal'.*Recommended/s)
  assert.match(home, /presetCells[^\n]+0: 'date'[^\n]+1: 'reminders'[^\n]+2: 'assistant'[^\n]+3: 'weather'/)
})

test('Sport and Family are absent from onboarding while sports modules remain in the app', () => {
  assert.doesNotMatch(frameSetupSource(), /'family'|'sport'|Choose sport|Velg sport|Family|Familie/)
  assert.match(home, /type ModuleKey = [^\n]*'surf'[^\n]*'soccer'/)
})

test('AI Follow branches through canonical entitlements and reusable subscription plans', () => {
  const setup = frameSetupSource()
  assert.match(setup, /get_ai_subscription_entitlements/)
  assert.match(setup, /current\.monitoring_enabled \? 'follow' : 'ai-intro'/)
  assert.match(setup, /AI_FOLLOW_PLANS\.filter/)
  assert.match(subscriptions, /export const AI_FOLLOW_PLANS/)
  assert.match(setup, /preview_ai_subscription_plan/)
  assert.match(setup, /if \(!confirmed\.monitoring_enabled\) throw/)
})

test('AI Follow creation, skip, back and completion reuse existing flows safely', () => {
  const setup = frameSetupSource()
  assert.match(setup, /create_ai_assistant_watch/)
  assert.match(setup, /p_frame_id: activeDeviceId/)
  assert.match(setup, /if \(saving \|\| billingPlan\) return/)
  assert.match(setup, /step === 'plans'\) setStep\('ai-intro'\)/)
  assert.match(setup, /step === 'follow'\) setStep/)
  assert.match(setup, /Hopp over foreløpig.*Skip for now/)
  assert.match(setup, /onComplete\(\{ purpose, modules \}\)/)
})

test('back from preset selection shows paired state without repeating the pairing operation', () => {
  const setup = frameSetupSource()
  assert.match(setup, /if \(step === 'purpose'\) setStep\('paired'\)/)
  assert.match(setup, /vi parer ikke framen på nytt/)
  assert.doesNotMatch(setup, /claimPairCodeAndLoadFrames/)
})
