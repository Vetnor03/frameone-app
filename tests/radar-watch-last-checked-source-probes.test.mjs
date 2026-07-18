import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sourceWorker=readFileSync(new URL('../supabase/functions/monitoring-source-worker/index.ts',import.meta.url),'utf8')
const paidWorker=readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts',import.meta.url),'utf8')
const migration=readFileSync(new URL('../supabase/migrations/20260718120000_add_monitoring_watch_checked_at_touch.sql',import.meta.url),'utf8')
const guardedMigration=readFileSync(new URL('../supabase/migrations/20260717180000_add_radar_two_stage_guarded.sql',import.meta.url),'utf8')

test('successful cheap source probe outcomes touch the parent watch last_checked_at',()=>{
  for(const outcome of ['not_modified','unchanged','changed','baseline_created']) assert.ok(sourceWorker.includes(outcome),outcome)
  assert.match(sourceWorker,/await db\.from\('monitoring_watch_sources'\)\.update\([\s\S]*last_checked_at:now[\s\S]*\)\.eq\('id',source\.id\)/)
  assert.match(sourceWorker,/await db\.rpc\('touch_monitoring_watch_checked_at',\{p_watch_id:source\.watch_id,p_checked_at:now\}\)/)
})

test('HTTP 304 uses the success path that updates the watch timestamp',()=>{
  assert.match(sourceWorker,/if\(status===304\) return await recordSuccess\([\s\S]*outcome:'not_modified'/)
})

test('changed cheap probe touches the watch before any guarded paid verification enqueue work',()=>{
  assert.ok(sourceWorker.indexOf("db.rpc('touch_monitoring_watch_checked_at'") < sourceWorker.indexOf("if(changed&&mode==='guarded'"))
  assert.match(sourceWorker,/changed&&mode==='guarded'/)
  assert.match(sourceWorker,/record_guarded_source_change|enqueue_monitoring_safety_fallback/)
})

test('handled failed source probe attempt touches the parent watch with the same completion timestamp',()=>{
  assert.match(sourceWorker,/const completedAt=new Date\(\); const completedAtIso=completedAt\.toISOString\(\)/)
  assert.match(sourceWorker,/last_checked_at:completedAtIso[\s\S]*db\.rpc\('touch_monitoring_watch_checked_at',\{p_watch_id:watch\.id,p_checked_at:completedAtIso\}\)[\s\S]*complete\(completedAtIso,\{last_error:code\}\)/)
})

test('ineligible skipped jobs complete the queue but do not touch watch last_checked_at',()=>{
  const skipped=sourceWorker.slice(sourceWorker.indexOf('source_not_eligible')-400,sourceWorker.indexOf('source_not_eligible')+300)
  assert.match(skipped,/complete\(new Date\(\)\.toISOString\(\),\{last_error:'source_not_eligible'\}\)/)
  assert.doesNotMatch(skipped,/touch_monitoring_watch_checked_at|monitoring_watches|last_checked_at/)
})

test('watch timestamp helper is atomic and monotonic for concurrent out-of-order probes',()=>{
  assert.match(migration,/create or replace function public\.touch_monitoring_watch_checked_at\(p_watch_id uuid,p_checked_at timestamptz\)/)
  assert.match(migration,/set last_checked_at=greatest\(coalesce\(last_checked_at,'-infinity'::timestamptz\),p_checked_at\)/)
  assert.match(migration,/where id=p_watch_id/)
})

test('full AI run still updates last_checked_at and last_full_discovery_at remains full-run-only',()=>{
  assert.match(paidWorker,/last_checked_at: completedAt\.toISOString\(\)/)
  assert.match(paidWorker,/if \(provider === 'openai'\) watchPatch\.last_full_discovery_at = completedAt\.toISOString\(\)/)
  assert.doesNotMatch(sourceWorker,/last_full_discovery_at/)
})

test('paid run avoided behavior and two-stage savings are unchanged',()=>{
  assert.match(guardedMigration,/paid_run_avoided/)
  assert.match(guardedMigration,/healthy_unchanged_source/)
  assert.match(sourceWorker,/changed&&mode==='guarded'/)
  assert.doesNotMatch(sourceWorker,/monitoring_runs|monitoring_updates|runOpenAIWatch/)
})
