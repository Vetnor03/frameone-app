import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const migration=readFileSync(new URL('../supabase/migrations/20260717180000_add_radar_two_stage_guarded.sql',import.meta.url),'utf8')
const scheduler=readFileSync(new URL('../supabase/functions/monitoring-scheduler/index.ts',import.meta.url),'utf8')
const source=readFileSync(new URL('../supabase/functions/monitoring-source-worker/index.ts',import.meta.url),'utf8')
const worker=readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts',import.meta.url),'utf8')
test('guarded is allowlisted and shadow remains legacy observation',()=>{assert.match(scheduler,/mode === 'guarded' && guardedConfigValid/);assert.match(scheduler,/enqueue_due_monitoring_watches/);assert.match(scheduler,/mode === 'shadow' \|\| mode === 'guarded'/)})
test('strong sources are conservative and broad articles retain legacy flow',()=>{for(const role of ['exact_url','feed','status','official','product','listing'])assert.ok(migration.includes(`'${role}'`));assert.match(migration,/news\|blog\|articles/);assert.match(migration,/not_strong_source_watch/)})
test('baseline and unchanged probes do not signal while changes signal once',()=>{assert.match(source,/baseline_created/);assert.match(source,/changed&&mode==='guarded'/);assert.match(migration,/monitoring_source_change_one_unconsumed_idx/);assert.match(migration,/pg_advisory_xact_lock/);assert.match(migration,/on conflict do nothing/)})
test('guard gate has discovery and safe fallbacks',()=>{assert.match(migration,/last_full_discovery_at/);assert.match(migration,/make_interval\(hours=>/);assert.match(migration,/sources_missing_stale_or_failing/);assert.match(migration,/eligibility_uncertain/);assert.match(migration,/healthy_unchanged_source/)})
test('backfill normalizes sources from history generically',()=>{assert.match(migration,/backfill_monitoring_watch_sources/);assert.match(migration,/monitoring_updates/);assert.match(migration,/discovered_sources/);assert.match(migration,/grounded_sources/);assert.match(migration,/register_monitoring_watch_sources/)})
test('verification consumes signal and paid cap reservation remains canonical',()=>{assert.match(worker,/consume_monitoring_source_signal/);assert.match(worker,/run_reason: runReason/);assert.match(worker,/reserve_paid_monitoring_run/);assert.match(worker,/await runOpenAIWatch/);assert.match(worker,/last_full_discovery_at/)})
test('audit separates avoided, verification, discovery and legacy reasons',()=>{for(const reason of ['paid_run_avoided','source_triggered_verification','fallback_discovery','legacy_adaptive'])assert.ok(migration.includes(reason))})
