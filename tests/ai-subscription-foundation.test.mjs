import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20260716180000_add_ai_subscription_foundation.sql', import.meta.url), 'utf8')
const ui = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts', import.meta.url), 'utf8')
const docs = readFileSync(new URL('../docs/ai-subscription-foundation.md', import.meta.url), 'utf8')

test('subscription account is provider-neutral, immutable from browsers, and exposes safe entitlements', () => {
  assert.match(migration, /create table public\.ai_subscription_accounts/)
  assert.match(migration, /plan in \('basic','normal','pro'\)/)
  assert.match(migration, /status in \('trialing','active','past_due','canceled','inactive'\)/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on public\.ai_subscription_accounts from public, anon, authenticated/)
  const entitlement = migration.match(/function public\.get_ai_subscription_entitlements[\s\S]*?end \$\$;/)?.[0] ?? ''
  assert.match(entitlement, /max_ongoing_watches/)
  assert.match(entitlement, /then 15 else null/)
  assert.doesNotMatch(entitlement, /provider_customer_id|provider_subscription_id/)
})

test('first successful creation starts an atomic 30-day Basic trial and applies plan-aware owner limits', () => {
  const create = migration.match(/function public\.create_ai_assistant_watch[\s\S]*?end \$\$;/)?.[0] ?? ''
  assert.match(create, /pg_advisory_xact_lock/)
  assert.match(create, /now\(\)\+interval '30 days'/)
  assert.match(create, /status in \('active','paused','error'\)/)
  assert.match(create, /max_ongoing_watches is not null/)
  assert.match(create, /subscription_required/)
  assert.match(create, /user_onboarding_state/)
  assert.ok(create.indexOf('insert into public.ai_subscription_accounts') < create.indexOf('insert into public.monitoring_watches'))
})

test('Instant compatibility is Pro-only, race safe, five-slot, and has no scheduler', () => {
  assert.match(migration, /add column is_instant boolean not null default false/)
  const instant = migration.match(/function public\.set_ai_assistant_watch_instant[\s\S]*?end \$\$;/)?.[0] ?? ''
  assert.match(instant, /pg_advisory_xact_lock/)
  assert.match(instant, /if not p_is_instant[\s\S]*is_instant=false/)
  assert.match(instant, /instant_not_available/)
  assert.match(instant, /instant_watch_limit_reached/)
  assert.match(migration, /then 5 else 0/)
  assert.match(migration, /then 15 else null/)
  assert.doesNotMatch(migration + worker, /5 minute Instant|instant.*5 \* MINUTES/i)
  assert.match(docs, /server-side every exactly \*\*15 minutes\*\*/)
  assert.match(docs, /independent of physical frame wake-ups/)
})

test('paid reservation blocks inactive subscriptions while mock runs remain uncharged', () => {
  const reserve = migration.match(/function public\.reserve_paid_monitoring_run[\s\S]*?end; \$\$/)?.[0] ?? ''
  assert.ok(reserve.indexOf("p_provider <> 'openai'") < reserve.indexOf('ai_monitoring_subscription_enabled'))
  assert.match(reserve, /reason', 'subscription_inactive'/)
  assert.match(reserve, /daily_run_limit_reached/)
  assert.match(reserve, /global_monthly_run_limit_reached/)
  assert.match(worker, /reason === 'subscription_inactive'/)
  assert.match(worker, /24 \* 60/)
  assert.ok(worker.indexOf("supabase.rpc('reserve_paid_monitoring_run'") < worker.indexOf('await runOpenAIWatch'))
})

test('client fails creation closed and represents unlimited with null', () => {
  assert.doesNotMatch(ui, /MAX_AI_ASSISTANT_WATCHES/)
  assert.match(ui, /max_ongoing_watches: number \| null/)
  assert.match(ui, /!entitlements\?\.monitoring_enabled/)
  assert.match(ui, /max === null/)
  assert.match(ui, /get_ai_subscription_entitlements/)
  assert.match(ui, /subscription_required/)
  assert.doesNotMatch(ui, /provider_customer_id|provider_subscription_id/)
})
