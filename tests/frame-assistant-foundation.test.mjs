import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const ui = readFileSync(new URL('../app/components/FrameAssistant.tsx', import.meta.url), 'utf8')
const resolver = readFileSync(new URL('../app/lib/assistant/resolver.ts', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8')
const tips = readFileSync(new URL('../app/lib/assistant/tips.ts', import.meta.url), 'utf8')

test('assistant is mounted only by the FRAME branch and respects its preference', () => {
  assert.match(home, /activeTab === 'frame' && !layoutFlow && !pickerOpen && showFrameAssistant/)
  assert.doesNotMatch(home, /activeTab !== 'frame'[^\n]*<FrameAssistant/)
  assert.match(home, /Show AI Assistant/)
})

test('tips are curated, limited, persisted and dismissible without AI', () => {
  assert.match(tips, /ASSISTANT_TIPS/)
  assert.doesNotMatch(tips, /fetch\(|openai/i)
  assert.match(home, /assistant_tips_shown/)
  assert.match(ui, /Dismiss assistant tip/)
})

test('deterministic help and grocery/reminder commands precede the compact AI fallback', () => {
  assert.match(resolver, /add_grocery_items/)
  assert.match(resolver, /create_reminder/)
  assert.match(resolver, /answer_help/)
  assert.match(api, /resolveDeterministicAssistantIntent\(body\.text\) \?\? await aiIntent/)
  assert.doesNotMatch(tips, /aiIntent|OPENAI_API_KEY/)
})

test('action execution validates membership, allowlists actions and masks raw errors', () => {
  assert.match(api, /from\('device_members'\)/)
  assert.match(api, /\.eq\('device_id', deviceId\)\.eq\('user_id', user\.id\)/)
  assert.match(resolver, /input\.action === 'add_grocery_items'/)
  assert.match(resolver, /input\.action === 'create_reminder'/)
  assert.match(api, /I couldn't do that\. Try again\./)
  assert.doesNotMatch(ui, /error\.message|stack/)
})

test('assistant requests contain compact context only', () => {
  assert.match(ui, /JSON\.stringify\(\{ text: text\.trim\(\), deviceId, language, localNow:/)
  assert.doesNotMatch(ui, /modulesJson|cellsByLayout|grocery_items|reminders:/)
})
