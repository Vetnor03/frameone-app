import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')

test('trial countdown has singular, plural, Norwegian, and paid-plan gating', () => {
  assert.match(assistant, /days === 1 \? '1 day left' : `\$\{days\} days left`/)
  assert.match(assistant, /days === 1 \? '1 dag igjen' : `\$\{days\} dager igjen`/)
  assert.match(assistant, /entitlements\?\.is_trial && <span className=\{trialUrgency\}>\{c\.trialDays\(trialDays\)\}<\/span>/)
  assert.match(assistant, /Math\.max\(0, Math\.min\(30, entitlements\?\.days_remaining_in_trial \?\? 0\)\)/)
})

test('Following and Radar meters use owned counts and entitlement allowances safely', () => {
  assert.match(assistant, /c\.following, ownedOngoingWatchCount, entitlements\.max_ongoing_watches/)
  assert.match(assistant, /c\.instant, ownedInstantWatchCount, entitlements\.max_instant_watches/)
  assert.match(assistant, /allowance <= 0 \? 0/)
  assert.match(assistant, /bg-\[#2aa3ff\]/)
  assert.doesNotMatch(assistant, /gradient/i)
})

test('a full plan stays neutral while creation remains disabled', () => {
  assert.match(assistant, /disabled=\{creating \|\| reachedWatchLimit\}/)
  assert.match(assistant, /Your current plan is full\. Change plan to follow more things\./)
  assert.match(assistant, /Abonnementet ditt er fullt\. Bytt plan for å følge flere ting\./)
  assert.match(assistant, /planIsFull && <p className="mt-2 text-center text-xs text-\[color:var\(--fg-55\)\]"/)
  assert.doesNotMatch(assistant, /You have reached your plan’s limit|All Radar slots are in use|Du har nådd grensen for abonnementet ditt|Alle Radar-plassene er i bruk/)
})

test('the section has no duplicate Radar counter and actual errors remain red', () => {
  const sectionHeader = assistant.slice(assistant.indexOf('<section className="mt-6">'), assistant.indexOf('{loading ?', assistant.indexOf('<section className="mt-6">')))
  assert.doesNotMatch(sectionHeader, /instantCounter|instantFull|ownedInstantWatchCount/)
  assert.match(assistant, /\{error && <div className="[^"]*border-red-400\/30[^"]*text-red-300"/)
})
