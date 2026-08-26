import test from 'node:test'
import assert from 'node:assert/strict'
import { ANALYTICS_INACTIVITY_MS, getAnalyticsSession, isProductEvent, safeAnalyticsMetadata, trackProductEvent } from '../app/lib/productAnalytics.mjs'
import { sanitizeAssistantGapText } from '../app/lib/assistant/gapSanitization.mjs'

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

test('only explicit classifier unsupported path writes a capability gap', async () => {
  const route = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8'))
  assert.match(route, /'unsupported' in classified[\s\S]*assistant_capability_gaps/)
  assert.match(route, /else return NextResponse\.json\(\{ \.\.\.friendlyError\(\), analytics: \{ resolver: 'ai', outcome: 'error'/)
  assert.match(route, /capabilityId: capability\.capabilityId/)
})
