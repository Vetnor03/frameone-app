import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20260717230000_update_ai_subscription_plan_limits.sql', import.meta.url), 'utf8')
const prior = readFileSync(new URL('../supabase/migrations/20260716213000_complete_instant_watch_plans.sql', import.meta.url), 'utf8')
const entitlement = migration.match(/function public\.get_ai_subscription_entitlements[\s\S]*?end \$\$;/)?.[0] ?? ''
const preview = migration.match(/function public\.preview_ai_subscription_plan[\s\S]*?end \$\$;/)?.[0] ?? ''

test('canonical entitlements apply final active plan totals and Radar allowances', () => {
  assert.match(entitlement, /not v_active then 0 when v_is_trial then 1 when a\.plan = 'basic' then 2 when a\.plan = 'normal' then 5 else 10/)
  assert.match(entitlement, /not v_active then 0 when v_is_trial then 1 when a\.plan = 'basic' then 1 when a\.plan = 'normal' then 2 else 5/)
  assert.match(entitlement, /v_active,\s*case when v_active then 15 else null end/)
})

test('inactive accounts have disabled monitoring, zero limits, and no Radar cadence', () => {
  assert.match(entitlement, /v_active,\s*case when not v_active then 0/)
  assert.match(entitlement, /case when not v_active then 0[\s\S]*case when not v_active then 0/)
  assert.match(entitlement, /case when v_active then 15 else null end/)
})

test('preview downgrade retains deterministic final Radar subsets safely', () => {
  assert.match(preview, /when 'trial' then 1 when 'basic' then 1 when 'normal' then 2 when 'pro' then 5/)
  assert.match(preview, /row_number\(\) over\(order by created_at,id\)/)
  assert.match(preview, /set is_instant=false,\s*next_check_at=greatest\(coalesce\(w\.next_check_at,now\(\)\),now\(\)\+interval '180 minutes'\)/)
  assert.doesNotMatch(preview, /delete from public\.monitoring_watches/)
})

test('creation, scheduling, paid caps, and unique queue protection remain canonical', () => {
  assert.match(prior, /owned_ongoing_watch_count >= e\.max_ongoing_watches/)
  assert.match(prior, /get_monitoring_watch_schedule_eligibility/)
  assert.match(prior, /instant_rank<=max_instant_watches/)
  assert.match(prior, /on conflict do nothing/)
  assert.doesNotMatch(migration, /create or replace function public\.(create_ai_assistant_watch|get_monitoring_watch_schedule_eligibility|enqueue_due_monitoring_watches)/)
})
