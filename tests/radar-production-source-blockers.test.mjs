import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const migration=readFileSync(new URL('../supabase/migrations/20260717210000_fix_radar_source_geography.sql',import.meta.url),'utf8')
const phase1=readFileSync(new URL('../supabase/migrations/20260717120000_add_radar_source_probe_shadow.sql',import.meta.url),'utf8')
const scheduler=readFileSync(new URL('../supabase/functions/monitoring-scheduler/index.ts',import.meta.url),'utf8')
const worker=readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts',import.meta.url),'utf8')

test('normalization collapses path slashes without touching protocol or query',()=>{
 assert.match(migration,/path_part:=regexp_replace\(path_part,'\/\{2,\}','\/','g'\)/)
 assert.match(migration,/scheme\|\|'\:\/\/'\|\|host\|\|path_part\|\|split_part\(suffix,'#',1\)/)
 assert.match(migration,/tracking keys|utm_/i)
})

test('service-only renormalization redirects history and merges strongest state',()=>{
 assert.match(migration,/renormalize_monitoring_watch_sources/)
 for(const table of ['monitoring_source_probe_queue','monitoring_source_probes','monitoring_source_change_signals','monitoring_two_stage_audit']) assert.match(migration,new RegExp(`update public\\.${table}`))
 assert.match(migration,/seen_count=k\.seen_count\+s\.seen_count/)
 assert.match(migration,/pg_advisory_xact_lock/)
 assert.match(migration,/revoke execute[\s\S]*renormalize_monitoring_watch_sources[\s\S]*from public,anon,authenticated/)
})

test('country-specific gating requires a healthy relevant source and fails open',()=>{
 assert.match(migration,/infer_monitoring_country_code/)
 assert.match(migration,/\('\s*no','norway\|norge\|noreg\|norwegian'\)/)
 assert.match(migration,/country is not null and relevant_healthy=0/)
 assert.match(migration,/country is not null and relevant_healthy=0[\s\S]*'eligibility_uncertain'/)
 assert.match(migration,/country is null or s\.geography_relevant is true/)
})

test('local sources rank first while foreign catalogue rows remain stored',()=>{
 assert.match(migration,/when geography_relevant then 0 else 1/)
 assert.match(worker,/register_monitoring_watch_sources[\s\S]*rerank_monitoring_watch_sources/)
 assert.doesNotMatch(migration,/delete from public\.monitoring_watch_sources where geography_relevant/)
 assert.match(migration,/monitoring_source_geography_relevance[\s\S]*p_country_code[\s\S]*p_domain/)
})

test('backfill repairs, reranks and promotes only after a fingerprint baseline',()=>{
 assert.match(migration,/backfill_monitoring_watch_sources[\s\S]*renormalize_monitoring_watch_sources/)
 assert.match(migration,/is_stable_grounded_detail/)
 assert.match(migration,/rerank_monitoring_watch_sources/)
})

test('Phase 1 stays observation-only and queue/cost protections are untouched',()=>{
 assert.match(phase1,/Forward-only; no paid-run gating/)
 assert.match(scheduler,/mode === 'guarded' && guardedConfigValid/)
 assert.match(scheduler,/mode === 'shadow' \|\| mode === 'guarded'/)
 assert.doesNotMatch(migration,/monitoring_run_limits|subscription|monthly_run/)
})
