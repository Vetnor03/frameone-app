import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('navigation uses an underline without a filled active tab', () => {
  assert.match(home, /data-nav-tab/)
  assert.match(home, /aria-current=\{isActive \? 'page' : undefined\}/)
  assert.match(home, /border-transparent text-\[color:var\(--fg-70\)\]/)
  assert.match(home, /text-\[#2aa3ff\] border-b-2 border-\[#2aa3ff\]/)
})

test('AI Follow uses one unboxed hero followed by a divided plan section', () => {
  assert.match(assistant, /assistant-main-card" className="px-1 pb-6 pt-3"/)
  assert.match(assistant, /RE:MIND[\s\S]*c\.heading[\s\S]*c\.intro[\s\S]*assistant-follow-input-container[\s\S]*SensitiveInformationHelper[\s\S]*createWatch/)
  assert.match(assistant, /assistant-subscription-card" className="border-y/)
  assert.match(assistant, /assistant-subscription-usage-row" className="divide-y/)
  assert.doesNotMatch(assistant, /assistant-main-card" className="[^"]*(?:rounded|bg-|border)/)
})

test('AI Follow composer has exactly one visible input surface', () => {
  assert.match(assistant, /assistant-follow-input-container" className="[^"]*bg-\[color:var\(--input-bg\)\]/)
  assert.match(assistant, /<textarea data-assistant-composer[\s\S]*?className="[^"]*bg-transparent/)
})

test('following requests remain elevated content-object cards', () => {
  assert.match(assistant, /<article key=\{w\.id\}[\s\S]*rounded-3xl border p-4 transition/)
  assert.match(assistant, /border-\[#2aa3ff\] bg-\[#2aa3ff\]\/10 ring-2/)
})
