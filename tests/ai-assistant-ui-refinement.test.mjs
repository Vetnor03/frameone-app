import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')

test('follow textarea sits in a distinct rounded bordered editable container', () => {
  assert.match(assistant, /data-testid="assistant-follow-input-container"/)
  assert.match(assistant, /assistant-follow-input-container" className="[^"]*rounded-3xl[^"]*border border-\[color:var\(--bd-20\)\][^"]*bg-\[color:var\(--card-bg\)\]\/80/)
  assert.match(assistant, /focus-within:border-\[#2aa3ff\]\/75/)
  assert.match(assistant, /<textarea aria-label=\{c\.placeholder\}[\s\S]*rows=\{4\}/)
})

test('placeholder is dimmer than entered assistant request text', () => {
  assert.match(assistant, /placeholder: 'What should RE:MIND follow\?'/)
  assert.match(assistant, /placeholder: 'Hva skal RE:MIND følge med på\?'/)
  assert.match(assistant, /text-\[color:var\(--fg-95\)\][^"]*placeholder:text-\[color:var\(--fg-40\)\]/)
})

test('Start following uses existing validation for active, muted, and plan-full disabled states', () => {
  assert.match(assistant, /const requestValidation = validateRequestText\(request\)/)
  assert.match(assistant, /const requestIsValid = requestValidation\.error == null/)
  assert.match(assistant, /const startFollowingIsActive = creating \|\| \(requestIsValid && !reachedWatchLimit\)/)
  assert.match(assistant, /const startFollowingDisabled = creating \|\| !requestIsValid \|\| reachedWatchLimit/)
  assert.match(assistant, /disabled=\{startFollowingDisabled\}/)
  assert.match(assistant, /startFollowingIsActive \? 'border-\[#2aa3ff\] bg-\[#2aa3ff\] text-white' : 'border-\[color:var\(--bd-20\)\] bg-\[color:var\(--fg-20\)\] text-\[color:var\(--fg-55\)\] opacity-70'/)
  assert.match(assistant, /transition-colors duration-200/)
})

test('subscription card keeps plan, trial, and usage values compactly grouped with no progress bars', () => {
  assert.match(assistant, /data-testid="assistant-subscription-top-row" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"/)
  assert.match(assistant, /\{planLabel \|\| c\.loading\}[\s\S]*\{planIsFull &&[\s\S]*\{entitlements\?\.is_trial && <span className=\{trialUrgency\}>\{c\.trialDays\(trialDays\)\}<\/span>\}/)
  assert.match(assistant, /data-testid="assistant-subscription-usage-row" className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1\.5 text-xs"/)
  assert.match(assistant, /inline-flex items-baseline gap-1\.5 whitespace-nowrap/)
  assert.match(assistant, /\[\[c\.following, ownedOngoingWatchCount, entitlements\.max_ongoing_watches\], \[c\.instant, ownedInstantWatchCount, Math\.max\(0, entitlements\.max_instant_watches\)\]\]/)
  assert.doesNotMatch(assistant, /progress|role="progressbar"|<progress/i)
})

test('this UI-only refinement does not touch backend, SQL, Edge Function, subscription, or scheduling files', () => {
  const workingTreeChanged = execSync('git diff --name-only HEAD', { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  const committedChanged = execSync('git show --name-only --format= HEAD', { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  const changed = workingTreeChanged.length > 0 ? workingTreeChanged : committedChanged
  for (const file of changed) {
    assert.doesNotMatch(file, /^supabase\//)
    assert.doesNotMatch(file, /subscription|schedule|monitoring-worker|\.sql$/i)
  }
})
