import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/SubscriptionSettingsPage.tsx', import.meta.url), 'utf8')

test('all four unchanged preview plan IDs remain available', () => {
  const ids = [...source.matchAll(/id: '(trial|basic|normal|pro)'/g)].map((match) => match[1])
  assert.deepEqual(ids, ['trial', 'basic', 'normal', 'pro'])
  assert.match(source, /PLANS\.map/)
  assert.match(source, /onClick=\{\(\) => switchPlan\(plan\.id\)\}/)
  assert.match(source, /rpc\('preview_ai_subscription_plan', \{ p_plan: plan \}\)/)
})

test('current preview is identified, announced, and disabled', () => {
  assert.match(source, /const selected = currentPlan === plan\.id/)
  assert.match(source, /aria-current=\{selected \? 'true' : undefined\}/)
  assert.match(source, /disabled=\{loading \|\| !!switching \|\| selected\}/)
  assert.match(source, /selected \? \(isNo \? 'Gjeldende plan' : 'Current plan'\)/)
})

test('prices and final things and Radar limits are shown', () => {
  for (const value of ['59 kr', '119 kr', '229 kr', 'Follow 1 thing', 'Follow up to 2 things', 'Follow up to 5 things', 'Follow up to 10 things', 'Radar on 1 thing', 'Radar on up to 2 things', 'Radar on up to 5 things']) {
    assert.match(source, new RegExp(value))
  }
})

test('English and Norwegian testing copy and preview actions are present', () => {
  for (const copy of [
    'Follow anything that matters to you', 'Følg med på det som betyr noe for deg',
    'Plan preview', 'Planforhåndsvisning',
    'Switch plans to test limits. No payment is made.',
    'Bytt plan for å teste grensene. Ingen betaling gjennomføres.',
    'Preview trial', 'Forhåndsvis prøveperiode', 'Preview', 'Forhåndsvis',
    'Most popular', 'Mest populær',
  ]) assert.match(source, new RegExp(copy))
})

test('presentation uses theme variables and a mobile-safe one-column layout', () => {
  assert.match(source, /var\(--fg\)/)
  assert.match(source, /var\(--panel-05\)/)
  assert.match(source, /var\(--bd-10\)/)
  assert.match(source, /overflow-x-hidden/)
  assert.match(source, /grid-cols-1 gap-3 sm:grid-cols-2/)
  assert.match(source, /min-w-0/)
})

test('the component introduces no payment, checkout, billing, or SQL behavior', () => {
  assert.doesNotMatch(source, /checkout|billing|renewal|cancel(?:lation)?|subscribe|upgrade|\.sql\b/i)
  const rpcNames = [...source.matchAll(/rpc\('([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(rpcNames, ['get_ai_subscription_entitlements', 'preview_ai_subscription_plan'])
})
