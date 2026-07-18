import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const statusStart = assistant.indexOf('<section data-testid="assistant-status-strip"')
const composerStart = assistant.indexOf('<section data-testid="assistant-composer"')
const composerEnd = assistant.indexOf('</section>', composerStart)
const status = assistant.slice(statusStart, composerStart)
const composer = assistant.slice(composerStart, composerEnd)

test('compact usage strip is separate from and precedes the focused composer', () => {
  assert.ok(statusStart > -1 && composerStart > statusStart)
  assert.match(status, /planLabel/)
  assert.match(status, /ownedOngoingWatchCount/)
  assert.match(status, /ownedInstantWatchCount/)
  assert.doesNotMatch(composer, /planLabel|ownedOngoingWatchCount|ownedInstantWatchCount|c\.usage/)
  assert.match(composer, /<textarea/)
  assert.match(composer, /disabled=\{creating \|\| reachedWatchLimit\}/)
})

test('trial countdown is localized, restrained, and only rendered for trials', () => {
  assert.match(assistant, /days === 1 \? '1 day left' : `\$\{days\} days left`/)
  assert.match(assistant, /days === 1 \? '1 dag igjen' : `\$\{days\} dager igjen`/)
  assert.match(status, /entitlements\?\.is_trial && <span className=\{trialUrgency\}>\{c\.trialDays\(trialDays\)\}<\/span>/)
  assert.match(assistant, /trialDays <= 1 \? 'font-semibold text-amber-400' : trialDays <= 3 \? 'text-amber-300' : 'text-\[color:var\(--fg-55\)\]'/)
  assert.doesNotMatch(status, /progressbar|meterWidth|style=\{\{ width/)
})

test('Following and Radar counts use current owned items and entitlements without meters', () => {
  assert.match(status, /c\.following, ownedOngoingWatchCount, entitlements\.max_ongoing_watches/)
  assert.match(status, /c\.instant, ownedInstantWatchCount, Math\.max\(0, entitlements\.max_instant_watches\)/)
  assert.doesNotMatch(status, /role="progressbar"|aria-valuenow|h-1 overflow-hidden/)
  assert.doesNotMatch(assistant, /gradient/i)
})

test('full capacity uses only a neutral compact label and disables creation', () => {
  assert.match(assistant, /fullPlan: 'Plan full'/)
  assert.match(assistant, /fullPlan: 'Abonnement fullt'/)
  assert.match(status, /planIsFull && <span className="rounded-full bg-\[#2aa3ff\]\/10/)
  assert.match(composer, /disabled=\{creating \|\| reachedWatchLimit\}/)
  assert.doesNotMatch(assistant, /Your current plan is full\. Change plan to follow more things\.|Abonnementet ditt er fullt\. Bytt plan for å følge flere ting\./)
  assert.doesNotMatch(composer, /c\.fullPlan|amber|yellow/)
})

test('Following header is simplified and genuine errors retain distinct error styling', () => {
  assert.match(assistant, /<h2[^>]*>\{c\.following\}<\/h2>/)
  assert.match(assistant, /c\.thingCount\(watches\.length\)/)
  assert.match(composer, /\{error && <div className="[^"]*border-red-400\/30[^"]*text-red-300"/)
})
