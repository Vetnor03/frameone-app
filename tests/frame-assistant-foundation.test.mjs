import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveDeterministicAssistantIntent } from '../app/lib/assistant/resolver.ts'
import { reminderFollowupContext, surfFollowupTime, validatePendingReminderPayload, validatePendingSurfPayload } from '../app/lib/assistant/pending.ts'
import { canonicalGroceryMergePriority, normalizeCanonicalGroceryAdditions } from '../app/lib/groceries/actions.ts'
import { ASSISTANT_TIPS, assistantPlaceholder, nextAssistantTip } from '../app/lib/assistant/tips.ts'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const ui = readFileSync(new URL('../app/components/FrameAssistant.tsx', import.meta.url), 'utf8')
const resolver = readFileSync(new URL('../app/lib/assistant/resolver.ts', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8')
const tips = readFileSync(new URL('../app/lib/assistant/tips.ts', import.meta.url), 'utf8')
const groceryActions = readFileSync(new URL('../app/lib/groceries/actions.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260825130000_add_frame_assistant_foundation.sql', import.meta.url), 'utf8')
const tipProgressionMigration = readFileSync(new URL('../supabase/migrations/20260825170000_mark_assistant_tip_shown.sql', import.meta.url), 'utf8')
const pendingActionsMigration = readFileSync(new URL('../supabase/migrations/20260825180000_expand_assistant_pending_actions.sql', import.meta.url), 'utf8')

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

test('proactive tips load persisted progress before selecting one tip per session', () => {
  assert.equal(nextAssistantTip([], 'en')?.index, 0, 'orientation is first for a new user')
  assert.equal(nextAssistantTip([0], 'en')?.index, 1, 'loaded persisted progress advances to groceries')
  assert.equal(nextAssistantTip([0, 1], 'en')?.index, 2, 'a reopened app does not repeat its previous tip')
  assert.match(ui, /if \(!tipsLoaded \|\| !tipsEnabled \|\| !canSelectTip \|\| tipSelected\.current\) return/)
  assert.match(ui, /tipSelected\.current = true/)
  assert.match(home, /canSelectTip=\{!assistantTipPresentedThisSession\}/)
  assert.match(home, /setAssistantTipsShown\(\(current\) => current\.includes\(index\) \? current : \[\.\.\.current, index\]\)/)
  assert.match(home, /supabase\.rpc\('mark_assistant_tip_shown'/)
})

test('a genuine background to foreground transition starts one new assistant visit', () => {
  assert.match(home, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/)
  assert.match(home, /document\.visibilityState === 'hidden'\) wasHidden = true/)
  assert.match(home, /if \(!wasHidden\) return[\s\S]*wasHidden = false/)
  assert.match(home, /\.select\('show_ai_assistant,proactive_assistant_tips,assistant_tips_shown'\)[\s\S]*setAssistantTipsShown/)
  assert.match(home, /setAssistantTipPresentedThisSession\(false\)[\s\S]*setAssistantVisitId/)
  assert.match(home, /window\.addEventListener\('pageshow', onPageShow\)/)
  assert.match(home, /event\.persisted && document\.visibilityState === 'visible'/)
  assert.match(home, /assistantVisitId=\{assistantVisitId\}/)
  assert.match(ui, /setSessionTip\(null\)[\s\S]*setTipDismissed\(false\)[\s\S]*tipSelected\.current = false[\s\S]*\[assistantVisitId\]/)
})

test('ordinary app UI and orientation state do not create assistant visits', () => {
  const visitChanges = [...home.matchAll(/setAssistantVisitId\(/g)]
  assert.equal(visitChanges.length, 1, 'only the foreground lifecycle advances the visit generation')
  const tabHandler = home.slice(home.indexOf('async function handleSelectTab'), home.indexOf('const saveAssistantPreferences'))
  assert.doesNotMatch(tabHandler, /assistantVisit|visibilitychange/)
  assert.doesNotMatch(ui, /setAssistantVisitId|orientationchange/)
})

test('exhausted tips remain exhausted and mark failures are diagnosed safely', () => {
  assert.equal(nextAssistantTip(ASSISTANT_TIPS.map((_, index) => index), 'en'), null)
  assert.match(home, /const \{ error \} = await supabase\.rpc\('mark_assistant_tip_shown'/)
  assert.match(home, /\[assistant-tips:mark-shown-failed\]/)
  assert.doesNotMatch(home, /mark-shown-failed[^\n]*error\.message/)
})

test('legacy persisted indexes migrate without hiding landscape or repeating groceries', () => {
  const migratedGroceries = [1]
  assert.equal(nextAssistantTip(migratedGroceries, 'en')?.index, 0, 'legacy [0] becomes [1], leaving landscape unseen')
  assert.equal(nextAssistantTip([...migratedGroceries, 0], 'en')?.index, 2, 'after landscape, the next launch advances to reminder')
  assert.match(tipProgressionMigration, /when 0 then 1[\s\S]*when 1 then 2[\s\S]*when 2 then 3/)
  assert.match(tipProgressionMigration, /where assistant_tip_indexes_v2 is null/)
  assert.match(tipProgressionMigration, /group by case legacy_index[\s\S]*when 0 then 1/)
  assert.match(home, /setAssistantTipPresentedThisSession\(false\)[\s\S]*if \(!userId\) return/)
})

test('proactive tip copy is exact in English and Norwegian and remains free', () => {
  assert.deepEqual(ASSISTANT_TIPS.map(({ en, no }) => ({ en, no })), [
    { en: 'Turn your phone sideways to preview your frame.', no: 'Snu telefonen sidelengs for å se hva som vises på rammen.' },
    { en: 'You can ask me to add groceries.', no: 'Du kan be meg legge til dagligvarer.' },
    { en: 'Try: “Remind me to call Mum tomorrow.”', no: 'Prøv: «Minn meg på å ringe mamma i morgen.»' },
    { en: 'I can help you find settings too.', no: 'Jeg kan også hjelpe deg å finne innstillinger.' },
  ])
  assert.deepEqual(ASSISTANT_TIPS.map(({ id }) => id), ['landscape-frame-preview', 'add-groceries', 'reminder-example', 'settings-help'])
  assert.doesNotMatch(tips, /fetch\(|openai|aiIntent/i)
})

test('assistant placeholder follows command tips and is neutral for informational tips', () => {
  const reminderTip = nextAssistantTip([0, 1], 'en')
  assert.equal(reminderTip?.id, 'reminder-example')
  assert.equal(assistantPlaceholder(reminderTip?.id, 'en'), 'Remind me to call Mum tomorrow')
  assert.notEqual(assistantPlaceholder(reminderTip?.id, 'en'), 'Add milk, eggs and bread')
  assert.equal(assistantPlaceholder('reminder-example', 'no'), 'Minn meg på å ringe mamma i morgen')
  assert.equal(assistantPlaceholder('add-groceries', 'en'), 'Add milk, eggs and bread')
  assert.equal(assistantPlaceholder('add-groceries', 'no'), 'Legg til melk, egg og brød')
  assert.equal(assistantPlaceholder('landscape-frame-preview', 'en'), 'What would you like me to do?')
  assert.equal(assistantPlaceholder('settings-help', 'no'), 'Hva vil du at jeg skal gjøre?')
  assert.match(ui, /placeholder=\{placeholder\}/)
  assert.doesNotMatch(ui, /setText\([^)]*(milk|melk|remind|Minn)/i)
})

test('deterministic help and grocery/reminder commands precede the compact AI fallback', () => {
  assert.match(resolver, /add_grocery_items/)
  assert.match(resolver, /create_reminder/)
  assert.match(resolver, /answer_help/)
  assert.match(api, /let capability = resolveDeterministicCapabilityRequest\(body\.text\)/)
  assert.doesNotMatch(tips, /aiIntent|OPENAI_API_KEY/)
})

test('obvious grocery commands are free while reserved add commands fall through', () => {
  for (const command of ['Add milk, eggs and bread', 'Add milk and bread to groceries', 'Legg til melk, egg og brød', 'Legg til melk og brød på handlelisten']) assert.equal(resolveDeterministicAssistantIntent(command)?.action, 'add_grocery_items')
  for (const command of ['Add weather to my frame', 'Add a countdown', 'Add reminders', 'Add Spond', 'Legg til vær på min ramme', 'Legg til en nedtelling', 'Legg til påminnelser', 'Legg til Spond']) assert.equal(resolveDeterministicAssistantIntent(command), null)
  for (const command of ['Remind me to call Mum tomorrow', 'Minn meg på å ringe mamma i morgen']) assert.equal(resolveDeterministicAssistantIntent(command)?.action, 'create_reminder')
})

test('short grocery shorthand is deterministic, quantity-aware, and protects reserved navigation words', () => {
  assert.deepEqual(resolveDeterministicAssistantIntent('Soyasaus')?.arguments, { items: [{ name: 'Soyasaus' }] })
  assert.deepEqual(resolveDeterministicAssistantIntent('Melk')?.arguments, { items: [{ name: 'Melk' }] })
  assert.deepEqual(resolveDeterministicAssistantIntent('Egg og brød')?.arguments, { items: [{ name: 'Egg' }, { name: 'brød' }] })
  assert.deepEqual(resolveDeterministicAssistantIntent('2 melk')?.arguments, { items: [{ name: 'melk', quantity: 2 }] })
  assert.deepEqual(resolveDeterministicAssistantIntent('Soy sauce')?.arguments, { items: [{ name: 'Soy sauce' }] })
  for (const word of ['weather', 'vær', 'layout', 'oppsett', 'settings', 'innstillinger', 'Spond', 'reminders']) assert.equal(resolveDeterministicAssistantIntent(word)?.action, 'answer_help')
  assert.match(api, /if \(!capability\)[\s\S]*aiIntent\(body\.text\)/)
})

test('module-aware routing recognizes natural reminders and surf logs before grocery fallback', () => {
  for (const phrase of ['Call mom tomorrow', 'Dentist Friday at 10', 'Ring mamma i morgen']) assert.equal(resolveDeterministicAssistantIntent(phrase)?.action, 'create_reminder')
  assert.deepEqual(resolveDeterministicAssistantIntent('Hellestø was poor today'), { action: 'log_surf_experience', arguments: { spot: 'Hellestø', rating: 2, date: 'today', comment: 'Hellestø was poor today' } })
  assert.deepEqual(resolveDeterministicAssistantIntent('Hellestø was poor at 14:00 today')?.arguments, { spot: 'Hellestø', rating: 2, date: 'today', time: '14:00', comment: 'Hellestø was poor at 14:00 today' })
  assert.deepEqual(resolveDeterministicAssistantIntent('Hellestø var god kl 14 i dag')?.arguments, { spot: 'Hellestø', rating: 5, date: 'today', time: '14:00', comment: 'Hellestø var god kl 14 i dag' })
})

test('surf clarification preserves validated pending context and accepts a time-only follow-up', () => {
  assert.deepEqual(validatePendingSurfPayload({ spot: 'Hellestø', rating: 2, date: 'today', comment: 'Hellestø was poor today' }), { spot: 'Hellestø', rating: 2, date: 'today', comment: 'Hellestø was poor today' })
  assert.equal(surfFollowupTime('around 14:00'), '14:00')
  assert.match(api, /What time were you at \$\{intent\.arguments\.spot\}/)
  assert.match(api, /pending\.action === 'log_surf_experience'/)
  assert.match(api, /POST as logSurfExperience/)
  assert.match(pendingActionsMigration, /'create_reminder', 'log_surf_experience'/)
})

test('manual and suggestion grocery failures reconcile and remain human-readable', () => {
  assert.match(home, /catch \{[\s\S]*loadGroceries\(\{ silent: true, preserveScroll: true \}\)\.catch\(\(\) => undefined\)[\s\S]*Couldn't add item\. Try again\./)
  assert.match(home, /async function addSuggestionInstantly[\s\S]*setSaving\(true\)[\s\S]*await addItem[\s\S]*catch \{[\s\S]*setAddFailed\(true\)[\s\S]*finally \{[\s\S]*setSaving\(false\)/)
  assert.doesNotMatch(home.slice(home.indexOf('async function addSuggestionInstantly'), home.indexOf('async function addSuggestionInstantly') + 1200), /console\.error|error\.message/)
})

test('assistant CTAs close the sheet and only promise reachable surfaces', () => {
  assert.match(ui, /setOpen\(false\); onNavigate/)
  assert.match(home, /frame-layout-controls/)
  assert.match(home, /case 'layout':[\s\S]*requestAnimationFrame[\s\S]*frame-layout-controls/)
  assert.match(resolver, /destination: 'groceries', message: 'Your saved recipes are in Groceries\.', label: 'Open Groceries'/)
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
  const handlers = readFileSync(new URL('../app/lib/assistant/handlers.ts', import.meta.url), 'utf8')
  assert.match(handlers, /addGroceryItemsCanonical\(ctx\.db, ctx\.deviceId/)
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
  const handlers = readFileSync(new URL('../app/lib/assistant/handlers.ts', import.meta.url), 'utf8')
  assert.match(handlers, /from\('device_members'\)/)
  assert.match(handlers, /\.eq\('device_id', ctx\.deviceId\)\.eq\('user_id', ctx\.user\.id\)/)
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
  assert.match(api, /if \(!capability\)[\s\S]*aiIntent\(body\.text\)/)
})
