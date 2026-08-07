import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('available following capacity shows the normal composer', () => {
  assert.match(assistant, /\{!reachedWatchLimit \? <>[\s\S]*data-testid="assistant-follow-input-container"/)
  assert.match(assistant, /assistant-follow-input-container" className="[^"]*rounded-3xl[^"]*border border-transparent[^"]*bg-\[color:var\(--panel-08\)\]/)
  assert.match(assistant, /focus-within:shadow-\[0_0_0_3px_rgba\(42,163,255,0\.16\)\]/)
  assert.match(assistant, /<textarea aria-label=\{c\.placeholder\}[\s\S]*rows=\{4\}/)
})

test('full following capacity hides composer and shows premium upgrade state', () => {
  assert.match(assistant, /: <div data-testid="assistant-full-plan-state"/)
  assert.match(assistant, /fullPlanTitle: 'You’re using your full plan'/)
  assert.match(assistant, /fullPlanBody: \(count: number, max: number\) => `You’re currently following \$\{count\} of \$\{max\} things\.`/)
  assert.match(assistant, /trialUpgradeText: 'Upgrade to follow more things and keep using Radar after your trial\.'/)
  assert.match(assistant, /fullPlanTitle: 'Du bruker hele abonnementet'/)
  assert.match(assistant, /trialUpgradeText: 'Oppgrader for å følge flere ting og fortsette å bruke Radar etter prøveperioden\.'/)
  assert.doesNotMatch(assistant, /yellow/i)
})

test('See plans opens the existing subscription settings screen', () => {
  assert.match(assistant, /onOpenPlans\?: \(\) => void/)
  assert.match(assistant, /data-testid="assistant-see-plans-button" onClick=\{onOpenPlans\}/)
  assert.match(home, /<AIAssistantTab[\s\S]*onOpenPlans=\{\(\) => \{[\s\S]*setSettingsSubpage\('subscription'\); setActiveTab\('settings'\)/)
  assert.match(home, /<SettingsTab[\s\S]*initialSubpage=\{settingsSubpage\}/)
  assert.match(home, /if \(subpage === 'subscription'\) \{\n\s*return <SubscriptionSettingsPage language=\{language\}/)
})

test('placeholder is dimmer than entered assistant request text', () => {
  assert.match(assistant, /placeholder: 'What should RE:MIND follow\?'/)
  assert.match(assistant, /placeholder: 'Hva skal RE:MIND følge med på\?'/)
  assert.match(assistant, /text-\[color:var\(--fg-95\)\][^"]*placeholder:text-\[color:var\(--fg-40\)\]/)
})

test('Start following keeps validation-driven active blue and muted disabled states when capacity exists', () => {
  assert.match(assistant, /async function createWatch\(\) \{\n\s*const validation = validateRequestText\(request\)/)
  assert.match(assistant, /const requestValidation = validateRequestText\(request\)/)
  assert.match(assistant, /const requestIsValid = requestValidation\.error == null/)
  assert.match(assistant, /const startFollowingIsActive = creating \|\| \(requestIsValid && !reachedWatchLimit\)/)
  assert.match(assistant, /const startFollowingDisabled = creating \|\| !requestIsValid \|\| reachedWatchLimit/)
  assert.match(assistant, /startFollowingIsActive \? 'border-\[#2aa3ff\] bg-\[#2aa3ff\] text-white hover:bg-\[#168fe8\]' : 'border-transparent bg-\[color:var\(--panel-10\)\] text-\[color:var\(--fg-55\)\] opacity-70'/)

  const active = { creating: false, requestIsValid: true, reachedWatchLimit: false }
  const invalid = { creating: false, requestIsValid: false, reachedWatchLimit: false }
  const disabled = (state) => state.creating || !state.requestIsValid || state.reachedWatchLimit
  const activeStyle = (state) => state.creating || (state.requestIsValid && !state.reachedWatchLimit)
  assert.equal(disabled(active), false)
  assert.equal(activeStyle(active), true)
  assert.equal(disabled(invalid), true)
  assert.equal(activeStyle(invalid), false)
})

test('subscription status is a divided settings section, shows usage, and removes Plan full badge', () => {
  assert.match(assistant, /data-testid="assistant-subscription-card" className="border-y border-\[color:var\(--bd-10\)\] py-4"/)
  assert.match(assistant, /data-testid="assistant-subscription-top-row" className="flex items-center justify-between gap-3 border-b border-\[color:var\(--bd-10\)\] pb-3 text-sm"/)
  assert.match(assistant, /\{planLabel \|\| c\.loading\}/)
  assert.match(assistant, /data-testid="assistant-subscription-usage-row" className="divide-y divide-\[color:var\(--bd-10\)\] text-sm"/)
  assert.match(assistant, /className="flex items-center justify-between gap-3 py-3 last:pb-0"/)
  assert.match(assistant, /font-semibold tabular-nums text-\[color:var\(--fg-85\)\]/)
  assert.match(assistant, /\[\[c\.following, ownedOngoingWatchCount, entitlements\.max_ongoing_watches\], \[c\.instant, ownedInstantWatchCount, Math\.max\(0, entitlements\.max_instant_watches\)\]\]/)
  assert.doesNotMatch(assistant, /\{planIsFull && <span/)
  assert.doesNotMatch(assistant, /progress|role="progressbar"|<progress/i)
})

test('trial countdown appears only during trial and uses urgency tiers', () => {
  assert.match(assistant, /const planLabel = entitlements\?\.is_trial \? c\.trial : entitlements \? c\.plan\(paidPlanName\) : ''/)
  assert.match(assistant, /\{entitlements\?\.is_trial && <span className=\{`\$\{trialUrgency\} shrink-0 whitespace-nowrap text-right`\}>\{c\.trialDays\(trialDays\)\}<\/span>\}/)
  assert.match(assistant, /trialDays <= 1 \? 'font-semibold text-amber-500 dark:text-amber-300' : trialDays <= 3 \? 'text-amber-600 dark:text-amber-400' : 'text-\[color:var\(--fg-55\)\]'/)
})

test('this UI-only refinement does not touch backend, SQL, Edge Function, subscription, or scheduling files', () => {
  const workingTreeChanged = execSync('git diff --name-only HEAD', { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  const committedChanged = execSync('git show --name-only --format= HEAD', { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  const changed = workingTreeChanged.length > 0 ? workingTreeChanged : committedChanged
  for (const file of changed) {
    assert.doesNotMatch(file, /^supabase\//)
    assert.doesNotMatch(file, /schedule|monitoring-worker|\.sql$/i)
  }
})
