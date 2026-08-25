import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveDeterministicAssistantIntent } from '../app/lib/assistant/resolver.ts'
import { reminderFollowupContext, validatePendingReminderPayload } from '../app/lib/assistant/pending.ts'
import { canonicalGroceryMergePriority, normalizeCanonicalGroceryAdditions } from '../app/lib/groceries/actions.ts'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const ui = readFileSync(new URL('../app/components/FrameAssistant.tsx', import.meta.url), 'utf8')
const resolver = readFileSync(new URL('../app/lib/assistant/resolver.ts', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8')
const tips = readFileSync(new URL('../app/lib/assistant/tips.ts', import.meta.url), 'utf8')
const groceryActions = readFileSync(new URL('../app/lib/groceries/actions.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260825130000_add_frame_assistant_foundation.sql', import.meta.url), 'utf8')

test('assistant is mounted only by the FRAME branch and respects its preference', () => {
  assert.match(home, /const isPlainFrameAssistantSurface = activeTab === 'frame'/)
  for (const gate of ['!layoutFlow', '!pickerOpen', '!themePickerOpen', '!languagePickerOpen', '!showSplash', '!shouldShowFirstFrameOnboarding', '!setupDeviceId']) assert.match(home, new RegExp(gate.replace('!', '\\!')))
  assert.match(home, /isPlainFrameAssistantSurface && showFrameAssistant/)
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
  assert.match(api, /let intent = resolveDeterministicAssistantIntent\(body\.text\)/)
  assert.doesNotMatch(tips, /aiIntent|OPENAI_API_KEY/)
})

test('obvious grocery commands are free while reserved add commands fall through', () => {
  for (const command of ['Add milk, eggs and bread', 'Add milk and bread to groceries']) assert.equal(resolveDeterministicAssistantIntent(command)?.action, 'add_grocery_items')
  for (const command of ['Add weather to my frame', 'Add a countdown', 'Add reminders', 'Add Spond']) assert.equal(resolveDeterministicAssistantIntent(command), null)
})

test('a reminder follow-up retains only validated short-lived reminder context', () => {
  const pending = validatePendingReminderPayload({ originalText: 'Remind me to call Mum', question: 'When?', partial: { title: 'Call Mum', due_date: null, due_time: null, end_date: null, end_time: null, repeat_type: 'none', custom_repeat_days: null, tag: null, ambiguities: [] } })
  assert.ok(pending)
  assert.deepEqual(reminderFollowupContext(pending, 'Tomorrow at 18:00', { localNow: '2026-08-25T12:00:00.000Z', timezone: 'Europe/Oslo', language: 'en' }), { text: 'Remind me to call Mum', partial: pending.partial, clarificationQuestion: 'When?', clarificationAnswer: 'Tomorrow at 18:00', localNow: '2026-08-25T12:00:00.000Z', timezone: 'Europe/Oslo', language: 'en' })
  assert.equal(validatePendingReminderPayload({ action: 'delete_everything' }), null)
  assert.match(api, /\.eq\('user_id', user\.id\)\.eq\('device_id', body\.deviceId\)/)
})

test('assistant and Groceries share one normalized transactional add path', () => {
  assert.deepEqual(normalizeCanonicalGroceryAdditions([{ name: ' Milk  ' }, { name: 'milk' }, { name: 'Bread', quantity: 2 }]), [{ name: 'Milk', quantity: 1, category: 'other' }, { name: 'Bread', quantity: 2, category: 'other' }])
  assert.match(home, /addGroceryItemsCanonical\(supabase, activeDeviceId/)
  assert.match(api, /addGroceryItemsCanonical\(db, deviceId/)
  assert.match(groceryActions, /add_grocery_items_canonical/)
  assert.match(migration, /for entry in select \* from jsonb_array_elements\(p_items\)/)
  assert.match(migration, /grocery_item_history/)
  assert.match(migration, /mark_grocery_item_probably_out/)
  assert.match(migration, /grocery_add_requests/)
})

test('canonical grocery merge priority exactly matches the former manual add behavior', () => {
  const requested = 'dairy'
  assert.equal(canonicalGroceryMergePriority({ isChecked: false, category: 'dairy' }, requested), 1, 'unchecked same-category wins')
  assert.equal(canonicalGroceryMergePriority({ isChecked: false, category: 'other' }, requested), 2, 'unchecked different-category precedes checked same-category')
  assert.equal(canonicalGroceryMergePriority({ isChecked: true, category: 'dairy' }, requested), 3, 'undo-visible same-category may be reused')
  assert.equal(canonicalGroceryMergePriority({ isChecked: true, category: 'other' }, requested), null, 'checked different-category must cause insertion')
  assert.match(migration, /not is_checked and category=cat then 1[\s\S]*when not is_checked then 2[\s\S]*when is_checked and category=cat then 3/)
  assert.match(migration, /not is_checked or \(checked_at > now\(\)-interval '10 minutes' and category=cat\)/)
})

test('canonical history records the effective grocery row category', () => {
  assert.match(migration, /effective_cat := existing\.category/)
  assert.match(migration, /effective_cat := cat/)
  assert.match(migration, /grocery_item_history set[\s\S]*category=effective_cat/)
  assert.match(migration, /grocery_item_history\(device_id,name,usage_count,category,last_used_at\)[\s\S]*effective_cat/)
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

test('rate limits are durable and AI is reached only after deterministic resolution', () => {
  assert.doesNotMatch(api, /new Map/)
  assert.match(api, /consume_assistant_request/)
  assert.match(migration, /assistant_request_limits/)
  assert.match(api, /if \(!intent\)[\s\S]*aiIntent\(body\.text\)/)
})
