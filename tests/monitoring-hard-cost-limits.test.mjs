import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20260714150000_add_monitoring_run_limit_enforcement.sql', import.meta.url), 'utf8')
const dedupMigration = readFileSync(new URL('../supabase/migrations/20260718190000_add_ai_watch_canonical_dedup.sql', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts', import.meta.url), 'utf8')

test('worker reserves allowance before paid OpenAI monitoring work', () => {
  assert.ok(worker.indexOf("supabase.rpc('reserve_paid_monitoring_run'") < worker.indexOf('runOpenAISharedDiscovery('))
  assert.ok(worker.indexOf("reserveOpenAICall('shared_discovery'") < worker.indexOf('runOpenAISharedDiscovery('))
  assert.ok(worker.indexOf("reserveOpenAICall('watch_evaluation'") < worker.indexOf('evaluateOpenAIWatchEvidence('))
  assert.match(worker, /provider === 'openai'/)
  assert.match(worker, /MONITORING_DEFAULT_DAILY_RUN_LIMIT_PER_USER/) 
  assert.match(worker, /MONITORING_DEFAULT_MONTHLY_RUN_LIMIT_PER_USER/)
})

test('actual OpenAI calls have atomic global and per-user accounting separate from logical checks', () => {
  assert.match(dedupMigration, /create table if not exists public\.monitoring_openai_calls/)
  assert.match(dedupMigration, /call_type in \('shared_discovery','watch_evaluation'\)/)
  assert.match(dedupMigration, /pg_advisory_xact_lock\(hashtext\('monitoring-openai-calls-global'\)\)/)
  assert.match(dedupMigration, /if p_charge_user then perform pg_advisory_xact_lock/)
  assert.match(dedupMigration, /global_daily_run_limit_reached/)
  assert.match(dedupMigration, /daily_run_limit_reached/)
  assert.match(worker, /reserveOpenAICall\('shared_discovery', false, model\)/)
  assert.match(worker, /reserveOpenAICall\('watch_evaluation', true, evaluationModel\)/)
})

test('daily and monthly user limits block paid requests with active watches', () => {
  assert.match(migration, /daily_run_limit_reached/)
  assert.match(migration, /monthly_run_limit_reached/)
  assert.match(migration, /coalesce\(l\.daily_run_limit, greatest\(coalesce\(p_default_daily_limit, 20\), 0\)\)/)
  assert.match(migration, /coalesce\(l\.monthly_run_limit, greatest\(coalesce\(p_default_monthly_limit, 300\), 0\)\)/)
  assert.match(worker, /status: 'active'/)
  const blockedBranch = worker.slice(worker.indexOf('if (!reservation?.allowed)'), worker.indexOf('    run = { id: reservation.run_id }'))
  assert.doesNotMatch(blockedBranch, /status: 'error'/)
})

test('global limits are configurable and zero or unset disables them', () => {
  assert.match(worker, /MONITORING_GLOBAL_DAILY_RUN_LIMIT/)
  assert.match(worker, /MONITORING_GLOBAL_MONTHLY_RUN_LIMIT/)
  assert.match(worker, /envInt\('MONITORING_GLOBAL_DAILY_RUN_LIMIT', 0\)/)
  assert.match(migration, /nullif\(greatest\(coalesce\(p_global_daily_limit, 0\), 0\), 0\)/)
  assert.match(migration, /global_daily_run_limit_reached/)
  assert.match(migration, /global_monthly_run_limit_reached/)
})

test('atomic RPC prevents parallel workers overspending final allowance', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('monitoring-paid-global'\)\)/)
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('monitoring-paid-user:' \|\| v_watch\.owner_user_id::text\)\)/)
  assert.ok(migration.indexOf('pg_advisory_xact_lock') < migration.lastIndexOf('insert into public.monitoring_runs'))
})

test('blocked queue items complete and next check moves to UTC reset with jitter', () => {
  assert.match(worker, /resetWithJitter/)
  assert.match(worker, /completed_at: new Date\(\)\.toISOString\(\), last_error: reason/)
  assert.match(worker, /next_check_at: nextCheckAt/)
  assert.match(migration, /date_trunc\('day', now\(\) at time zone 'utc'\)/)
  assert.match(migration, /date_trunc\('month', now\(\) at time zone 'utc'\)/)
})

test('mock and interpretation runs do not consume monitoring-search allowance', () => {
  assert.match(worker, /provider === 'openai'/)
  assert.match(worker, /mockMonitoringResult/)
  assert.doesNotMatch(readFileSync(new URL('../supabase/functions/interpret-ai-assistant/index.ts', import.meta.url), 'utf8'), /reserve_paid_monitoring_run/)
  assert.match(migration, /r\.provider = 'openai'/)
})

test('service-role usage RPC exposes dashboard-ready usage fields only through service role', () => {
  assert.match(migration, /get_monitoring_paid_usage/)
  for (const field of ['paid_checks_today', 'paid_checks_this_month', 'daily_limit', 'monthly_limit', 'remaining_today', 'remaining_this_month', 'next_daily_reset_at', 'next_monthly_reset_at']) {
    assert.match(migration, new RegExp(field))
  }
  assert.match(migration, /revoke execute on function public\.get_monitoring_paid_usage\(uuid,integer,integer\) from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.get_monitoring_paid_usage\(uuid,integer,integer\) to service_role/)
})
