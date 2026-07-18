import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const mainStart = assistant.indexOf('<section data-testid="assistant-main-card"')
const subscriptionStart = assistant.indexOf('<section data-testid="assistant-subscription-card"')
const followingStart = assistant.indexOf('<section className="mt-6">')
const followingBodyStart = assistant.indexOf('{loading ?', followingStart)
const main = assistant.slice(mainStart, subscriptionStart)
const subscription = assistant.slice(subscriptionStart, followingStart)
const followingHeader = assistant.slice(followingStart, followingBodyStart)

test('main assistant card contains the label, heading, intro, textarea, and create button together', () => {
  assert.ok(mainStart > -1)
  assert.ok(subscriptionStart > mainStart)
  assert.match(main, /RE:MIND/)
  assert.match(main, /<h1[^>]*>\{c\.heading\}<\/h1>/)
  assert.match(main, /\{c\.intro\}/)
  assert.match(main, /<textarea/)
  assert.match(main, /\{creating \? c\.creating : c\.button\}/)
  assert.match(main, /disabled=\{creating \|\| reachedWatchLimit\}/)
  assert.doesNotMatch(main, /planLabel|ownedOngoingWatchCount|ownedInstantWatchCount|c\.usage/)
})

test('subscription card is outside and directly below the main assistant card', () => {
  assert.ok(subscriptionStart > mainStart)
  assert.match(subscription, /planLabel/)
  assert.match(subscription, /ownedOngoingWatchCount/)
  assert.match(subscription, /ownedInstantWatchCount/)
  assert.match(subscription, /Math\.max\(0, entitlements\.max_instant_watches\)/)
  assert.ok(followingStart > subscriptionStart)
  assert.doesNotMatch(subscription, /<textarea|c\.intro|c\.button/)
  assert.match(assistant.slice(mainStart, followingStart), /assistant-main-card[\s\S]*assistant-subscription-card/)
})

test('trial countdown is localized, restrained, and only rendered for trials', () => {
  assert.match(assistant, /days === 1 \? '1 day left' : `\$\{days\} days left`/)
  assert.match(assistant, /days === 1 \? '1 dag igjen' : `\$\{days\} dager igjen`/)
  assert.match(subscription, /entitlements\?\.is_trial && <span className=\{trialUrgency\}>\{c\.trialDays\(trialDays\)\}<\/span>/)
  assert.match(assistant, /trialDays <= 1 \? 'font-semibold text-amber-400' : trialDays <= 3 \? 'text-amber-300' : 'text-\[color:var\(--fg-55\)\]'/)
  assert.doesNotMatch(subscription, /progressbar|meterWidth|style=\{\{ width/)
})

test('full capacity uses only a neutral compact badge and disables creation', () => {
  assert.match(assistant, /fullPlan: 'Plan full'/)
  assert.match(assistant, /fullPlan: 'Abonnement fullt'/)
  assert.match(subscription, /planIsFull && <span className="rounded-full bg-\[#2aa3ff\]\/10/)
  assert.match(main, /disabled=\{creating \|\| reachedWatchLimit\}/)
  assert.doesNotMatch(assistant, /Your current plan is full\. Change plan to follow more things\.|Abonnementet ditt er fullt\. Bytt plan for å følge flere ting\./)
  assert.doesNotMatch(main, /c\.fullPlan|amber|yellow/)
})

test('no progress bars are rendered and Following header stays simplified', () => {
  assert.doesNotMatch(assistant, /role="progressbar"|aria-valuenow|h-1 overflow-hidden|<progress|<meter/)
  assert.match(assistant, /<h2[^>]*>\{c\.following\}<\/h2>/)
  assert.match(assistant, /c\.thingCount\(watches\.length\)/)
  assert.doesNotMatch(followingHeader, /ownedInstantWatchCount|c\.instant, ownedInstantWatchCount|c\.instant/)
  assert.match(main, /\{error && <div className="[^"]*border-red-400\/30[^"]*text-red-300"/)
})

test('AI Assistant UI refinement changes no backend, SQL, Edge Function, or entitlement logic files', async () => {
  const { execFileSync } = await import('node:child_process')
  const changedFiles = execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  const forbiddenFiles = changedFiles.filter((file) => file.startsWith('supabase/') || file.endsWith('.sql') || file.includes('/entitlement') || file.includes('subscription'))
  assert.deepEqual(forbiddenFiles, [])
})
