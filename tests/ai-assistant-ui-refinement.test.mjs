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

test('Start following uses createWatch request validation for active and disabled state logic', () => {
  assert.match(assistant, /async function createWatch\(\) \{\n\s*const validation = validateRequestText\(request\)/)
  assert.match(assistant, /const requestValidation = validateRequestText\(request\)/)
  assert.match(assistant, /const requestIsValid = requestValidation\.error == null/)
  assert.match(assistant, /const startFollowingIsActive = creating \|\| \(requestIsValid && !reachedWatchLimit\)/)
  assert.match(assistant, /const startFollowingDisabled = creating \|\| !requestIsValid \|\| reachedWatchLimit/)
  assert.match(assistant, /disabled=\{startFollowingDisabled\}/)
})

test('Start following has regression-covered active, muted, creating, and plan-full presentation', () => {
  assert.match(assistant, /data-state=\{startFollowingIsActive \? 'active' : 'muted'\}/)
  assert.match(assistant, /startFollowingIsActive \? 'border-\[#2aa3ff\] bg-\[#2aa3ff\] text-white hover:bg-\[#168fe8\]' : 'border-\[color:var\(--bd-20\)\] bg-\[color:var\(--fg-20\)\] text-\[color:var\(--fg-55\)\] opacity-70'/)
  assert.match(assistant, /transition-colors duration-200 ease-out/)
  assert.match(assistant, /\{creating \? c\.creating : c\.button\}/)

  const active = { creating: false, requestIsValid: true, reachedWatchLimit: false }
  const invalid = { creating: false, requestIsValid: false, reachedWatchLimit: false }
  const full = { creating: false, requestIsValid: true, reachedWatchLimit: true }
  const loading = { creating: true, requestIsValid: true, reachedWatchLimit: false }
  const disabled = (state) => state.creating || !state.requestIsValid || state.reachedWatchLimit
  const activeStyle = (state) => state.creating || (state.requestIsValid && !state.reachedWatchLimit)

  assert.equal(disabled(active), false, 'valid input + available capacity is enabled')
  assert.equal(activeStyle(active), true, 'valid input + available capacity is blue')
  assert.equal(disabled(invalid), true, 'invalid/empty input is disabled')
  assert.equal(activeStyle(invalid), false, 'invalid/empty input is muted')
  assert.equal(disabled(full), true, 'valid input + full plan is disabled')
  assert.equal(activeStyle(full), false, 'valid input + full plan is muted')
  assert.equal(disabled(loading), true, 'creating/loading prevents repeat clicks')
  assert.equal(activeStyle(loading), true, 'creating/loading remains blue')
})

test('subscription card keeps plan status and usage values compactly grouped with no progress bars', () => {
  assert.match(assistant, /data-testid="assistant-subscription-top-row" className="flex items-start justify-between gap-3 text-xs"/)
  assert.match(assistant, /<div className="min-w-0 space-y-1">[\s\S]*\{planLabel \|\| c\.loading\}[\s\S]*\{planIsFull &&[\s\S]*\{entitlements\?\.is_trial && <span className=\{`\$\{trialUrgency\} shrink-0 whitespace-nowrap text-right`\}>\{c\.trialDays\(trialDays\)\}<\/span>\}/)
  assert.match(assistant, /data-testid="assistant-subscription-usage-row" className="mt-2\.5 flex flex-wrap items-start gap-x-6 gap-y-2 text-xs"/)
  assert.match(assistant, /flex min-w-\[7rem\] flex-1 basis-\[calc\(50%-0\.75rem\)\] flex-col gap-0\.5/)
  assert.match(assistant, /font-semibold tabular-nums text-\[color:var\(--fg-85\)\]/)
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
