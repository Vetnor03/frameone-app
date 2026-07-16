import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const foundation = readFileSync(new URL('../supabase/migrations/20260716180000_add_ai_subscription_foundation.sql', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260716213000_complete_instant_watch_plans.sql', import.meta.url), 'utf8')
const ui = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts', import.meta.url), 'utf8')

function body(name) {
  return migration.match(new RegExp(`function public\\.${name}[\\s\\S]*?(?:end \\$\\$;|\\$\\$;)`))?.[0] ?? ''
}

test('provider-neutral account constraints remain unchanged in the applied foundation', () => {
  assert.match(foundation, /plan in \('basic','normal','pro'\)/)
  assert.match(foundation, /status in \('trialing','active','past_due','canceled','inactive'\)/)
  assert.doesNotMatch(migration, /alter table public\.ai_subscription_accounts/)
})

test('all final total and Instant limits are numeric subsets', () => {
  const entitlement = body('get_ai_subscription_entitlements')
  for (const fragment of ["v_is_trial then 2", "a.plan = 'basic' then 3", "a.plan = 'normal' then 5", 'else 10', "v_is_trial then 1", "a.plan = 'basic' then 0", "a.plan = 'normal' then 1", 'else 5']) assert.match(entitlement, new RegExp(fragment))
  assert.match(entitlement, /when not v_active then 0/)
  assert.doesNotMatch(entitlement.match(/max_ongoing_watches[\s\S]*/)?.[0] ?? '', /then null/)
  assert.match(entitlement, /then 15 else null/)
})

test('atomic creation counts only owner ongoing Watches and enforces numeric plan limit', () => {
  const create = body('create_ai_assistant_watch')
  assert.match(create, /pg_advisory_xact_lock/)
  assert.match(create, /owner_user_id=current_user_id and mw\.status in \('active','paused','error'\)/)
  assert.match(create, /owned_ongoing_watch_count >= e\.max_ongoing_watches/)
  assert.match(create, /watch_limit_reached/)
  assert.match(create, /now\(\)\+interval '30 days'/)
})

test('Assistant uses numeric counters and never exposes provider identifiers', () => {
  assert.match(ui, /max_ongoing_watches: number;/)
  assert.match(ui, /ownedOngoingWatchCount >= entitlements\.max_ongoing_watches/)
  assert.doesNotMatch(ui, /max_ongoing_watches: number \| null|max === null|provider_customer_id|provider_subscription_id/)
})

test('paid protections remain before OpenAI work and mock runs remain excluded', () => {
  assert.ok(worker.indexOf("supabase.rpc('reserve_paid_monitoring_run'") < worker.indexOf('await runOpenAIWatch'))
  assert.match(foundation, /p_provider <> 'openai'/)
  assert.match(foundation, /daily_run_limit_reached/)
})
