import test from 'node:test'
import assert from 'node:assert/strict'
import { ANALYTICS_INACTIVITY_MS, getAnalyticsSession, isProductEvent, safeAnalyticsMetadata, trackProductEvent } from '../app/lib/productAnalytics.mjs'
import { normalizeAssistantGapText, sanitizeAssistantGapText } from '../app/lib/assistant/gapSanitization.mjs'

function storage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

test('event taxonomy rejects unregistered and content-shaped event names', () => {
  assert.equal(isProductEvent('tab_opened'), true)
  assert.equal(isProductEvent('clicked_buy_milk'), false)
})

test('metadata allow-list removes generic user content', () => {
  assert.deepEqual(safeAnalyticsMetadata({ tab: 'surf', title: 'private reminder', email: 'person@example.com', recurring: true }), { tab: 'surf', recurring: true })
  assert.deepEqual(safeAnalyticsMetadata({ tab: 'not-a-real-tab', capabilityId: 'settings.set_app_theme', followupCount: 2 }), { capabilityId: 'settings.set_app_theme', followupCount: 2 })
  assert.deepEqual(safeAnalyticsMetadata({ capabilityId: 'send private reminder text', resolver: true, recurring: 'yes', errorType: 'network error' }), {})
})

test('session is reused until thirty minutes of inactivity', () => {
  const local = storage()
  const first = getAnalyticsSession(local, 1_000)
  const reused = getAnalyticsSession(local, 1_000 + ANALYTICS_INACTIVITY_MS - 1)
  const renewed = getAnalyticsSession(local, 1_000 + ANALYTICS_INACTIVITY_MS * 2)
  assert.equal(first.started, true); assert.equal(reused.started, false); assert.equal(reused.id, first.id)
  assert.equal(renewed.started, true); assert.notEqual(renewed.id, first.id)
})

test('tracking is fire-and-forget and analytics failure cannot reject the action', async () => {
  const originalWindow = globalThis.window
  globalThis.window = { localStorage: storage() }
  let calls = 0
  assert.doesNotThrow(() => trackProductEvent({ event: 'tab_opened', metadata: { tab: 'surf', title: 'never sent' } }, { send: async (payload) => { calls++; assert.equal(payload.metadata.title, undefined); throw new Error('offline') } }))
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(calls, 1)
  globalThis.window = originalWindow
})

test('Assistant gap sanitizer replaces email, phone, secrets and truncates', () => {
  const clean = sanitizeAssistantGapText('Email John@Example.com or +47 912 34 567 Authorization: Bearer-secret ' + 'x'.repeat(400))
  assert.match(clean, /\[email\]/); assert.match(clean, /\[phone\]/); assert.match(clean, /\[secret\]/)
  assert.ok(clean.length <= 280)
})

test('Assistant gap normalization groups casing, whitespace and punctuation conservatively', () => {
  assert.equal(normalizeAssistantGapText('  Send EMAIL to [email]!! '), 'send email to [email]')
  assert.notEqual(normalizeAssistantGapText('play music in kitchen'), normalizeAssistantGapText('play music in bedroom'))
})

test('only explicit classifier unsupported path writes a capability gap', async () => {
  const route = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8'))
  assert.match(route, /'unsupported' in classified[\s\S]*assistant_capability_gaps/)
  assert.match(route, /else return NextResponse\.json\(\{ \.\.\.friendlyError\(\), analytics: \{ resolver: 'ai', outcome: 'error'/)
  assert.match(route, /capabilityId: capability\.capabilityId/)
  assert.match(route, /await admin\.from\('assistant_capability_gaps'\)\.insert/)
  assert.match(route, /if \(gapError\) console\.warn\('\[assistant-gap:insert-failed\]', \{ code:/)
  assert.match(route, /catch \{\s*console\.warn\('\[assistant-gap:insert-failed\]', \{ code: 'unexpected' \}\)\s*\}[\s\S]*status: 'unsupported'/)
  assert.doesNotMatch(route, /assistant_capability_gaps'[\s\S]{0,250}(?:user_id|device_id)/)
})

test('database RPC is the only analytics write boundary and validates values', async () => {
  const sql = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../supabase/migrations/20260826120000_add_product_analytics.sql', import.meta.url), 'utf8'))
  assert.match(sql, /security definer set search_path = pg_catalog, public/)
  assert.match(sql, /revoke all on public\.product_analytics_events from anon, authenticated/)
  assert.doesNotMatch(sql, /grant insert on public\.product_analytics_events/)
  assert.match(sql, /if caller_id is null then raise exception 'authentication required'/)
  assert.match(sql, /not \(p_event_name = any\(allowed_events\)\).*invalid event/)
  assert.match(sql, /jsonb_object_keys\(p_metadata\).*invalid metadata key/)
  for (const contract of ['invalid tab', 'invalid provider', 'invalid recurring', 'invalid layout type', 'invalid resolver', 'invalid outcome', 'invalid followup count', 'invalid capability id']) assert.match(sql, new RegExp(contract))
  assert.match(sql, /values \(caller_id, p_client_id, p_frame_device_id, p_session_id, p_event_name/)
})

test('browser install and physical frame identifiers are unambiguous', async () => {
  const [helper, route, sql] = await Promise.all([
    import('node:fs/promises').then((fs) => fs.readFile(new URL('../app/lib/productAnalytics.mjs', import.meta.url), 'utf8')),
    import('node:fs/promises').then((fs) => fs.readFile(new URL('../app/api/analytics/events/route.ts', import.meta.url), 'utf8')),
    import('node:fs/promises').then((fs) => fs.readFile(new URL('../supabase/migrations/20260826120000_add_product_analytics.sql', import.meta.url), 'utf8')),
  ])
  assert.match(helper, /clientInstallId/); assert.doesNotMatch(helper, /function deviceId/)
  assert.match(route, /p_client_id:.*clientInstallId/)
  assert.match(sql, /client_id text not null/); assert.match(sql, /frame_device_id text/)
})

test('Assistant reminder recurrence and Help resolver metadata come from canonical server results', async () => {
  const [route, help, client] = await Promise.all([
    import('node:fs/promises').then((fs) => fs.readFile(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8')),
    import('node:fs/promises').then((fs) => fs.readFile(new URL('../app/lib/assistant/help.ts', import.meta.url), 'utf8')),
    import('node:fs/promises').then((fs) => fs.readFile(new URL('../app/components/FrameAssistant.tsx', import.meta.url), 'utf8')),
  ])
  assert.match(route, /recurring: reminder\.repeat_type !== 'none'/)
  assert.match(client, /recurring: value\.analytics\.recurring/)
  assert.doesNotMatch(client, /recurring: false/)
  assert.match(help, /resolver: 'deterministic'.*helpTopicId: topic\.id/)
  assert.match(route, /resolver: 'ai'.*helpTopicId: classifiedHelpTopic/)
})
