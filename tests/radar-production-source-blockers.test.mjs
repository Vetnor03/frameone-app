import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const migration=readFileSync(new URL('../supabase/migrations/20260717210000_fix_radar_source_geography.sql',import.meta.url),'utf8')
const foundation=readFileSync(new URL('../supabase/migrations/20260713130000_add_monitoring_watch_foundation.sql',import.meta.url),'utf8')
const phase1=readFileSync(new URL('../supabase/migrations/20260717120000_add_radar_source_probe_shadow.sql',import.meta.url),'utf8')
const phase2=readFileSync(new URL('../supabase/migrations/20260717180000_add_radar_two_stage_guarded.sql',import.meta.url),'utf8')
const scheduler=readFileSync(new URL('../supabase/functions/monitoring-scheduler/index.ts',import.meta.url),'utf8')
const worker=readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts',import.meta.url),'utf8')

test('normalization changes path slashes but not protocol or query',()=>{
 assert.match(migration,/path_part:=regexp_replace\(path_part,'\/\{2,\}','\/','g'\)/)
 assert.match(migration,/scheme\|\|'\:\/\/'\|\|host\|\|path_part\|\|split_part\(suffix,'#',1\)/)
})

test('backfill obeys the production runs and updates schema contract',()=>{
 assert.match(foundation,/public\.monitoring_runs[\s\S]*raw_result jsonb/)
 assert.match(foundation,/public\.monitoring_updates[\s\S]*source_urls jsonb/)
 assert.match(migration,/u\.source_urls/)
 assert.match(migration,/r\.raw_result->'discovered_sources'/)
 assert.match(migration,/r\.raw_result->'sources'/)
 assert.match(migration,/r\.raw_result->'grounded_sources'/)
 assert.match(migration,/r\.raw_result->'normalized_returned_source_urls'/)
 assert.match(migration,/r\.raw_result->'normalized_citation_urls'/)
 assert.doesNotMatch(migration,/r\.discovered_sources|u\.grounded_sources/)
})

test('string URL arrays become registry objects',()=>{
 assert.match(migration,/jsonb_typeof\(v\)='string' then jsonb_build_object\('url',v#>>'\{\}'\)/)
})

test('backfill is deterministic and cannot manufacture repeated evidence',()=>{
 assert.doesNotMatch(migration,/backfill_monitoring_watch_sources[\s\S]*register_monitoring_watch_sources/)
 assert.match(migration,/count\(distinct evidence_id\) seen_count/)
 assert.match(migration,/select r\.watch_id,'run:'\|\|r\.id,v->>'url'/)
 assert.match(migration,/seen_count=greatest\(monitoring_watch_sources\.seen_count,excluded\.seen_count\)/)
 assert.match(migration,/where \(monitoring_watch_sources\.seen_count[\s\S]*is distinct from/)
})

test('renormalization preserves historical foreign keys and strongest state',()=>{
 for(const table of ['monitoring_source_probe_queue','monitoring_source_probes','monitoring_source_change_signals','monitoring_two_stage_audit']) assert.match(migration,new RegExp(`update public\\.${table}`))
 assert.match(migration,/pg_advisory_xact_lock/)
 assert.match(migration,/seen_count=k\.seen_count\+s\.seen_count/)
})

test('country intent distinguishes none resolved and ambiguous with structured precedence',()=>{
 assert.match(migration,/intent_state text,country_code text/)
 assert.match(migration,/return query select 'none'/)
 assert.match(migration,/return query select 'resolved'/)
 assert.match(migration,/return query select 'ambiguous'/)
 assert.match(migration,/if structured=country\.code then return query select 'resolved'/)
 assert.match(migration,/cardinality\(targeted\)>0 then contextual:=targeted/)
})

test('geography accepts market proof and ccTLD aliases but rejects language-only hints',()=>{
 assert.match(migration,/when 'gb' then 'uk'/)
 assert.match(migration,/\(country\|market\|region\)=/)
 assert.match(migration,/locale=\[a-z\]\{2\}\[-_\]/)
 assert.doesNotMatch(migration,/\(country\|market\|locale\|region\|lang\)/)
 assert.doesNotMatch(migration,/\[\/?&\]\(country\|market\|locale\|region\|lang\)/)
 assert.doesNotMatch(migration,/\^https\?\:\/\/\[\^\/\]\+\/['"]?\|\|p_country_code/)
})

test('guarded outcomes preserve broad-watch legacy and geographic fail-open behavior',()=>{
 assert.match(migration,/active_count=0[\s\S]*'missing_sources'/)
 assert.match(migration,/strong_count=0[\s\S]*'not_strong_source_watch'/)
 assert.match(migration,/healthy_count=0[\s\S]*'sources_missing_stale_or_failing'/)
 assert.match(migration,/intent\.intent_state='ambiguous'[\s\S]*'eligibility_uncertain'/)
 assert.match(migration,/intent\.intent_state='resolved' and relevant_healthy=0/)
 assert.match(migration,/exception when others then return query select false,'eligibility_uncertain'/)
 assert.match(phase2,/reason in \('missing_sources','sources_missing_stale_or_failing','eligibility_uncertain'\) then 'safety_fallback'[\s\S]*when not can_gate then 'legacy_adaptive'/)
})

test('local ranking remains fail-soft after paid discovery',()=>{
 assert.match(migration,/when geography_relevant then 0 else 1/)
 assert.match(worker,/register_monitoring_watch_sources[\s\S]*rerank_monitoring_watch_sources/)
 assert.doesNotMatch(migration,/delete from public\.monitoring_watch_sources where geography_relevant/)
})

test('shadow, paid caps, and unique-open-job protections remain unchanged',()=>{
 assert.match(phase1,/Forward-only; no paid-run gating/)
 assert.match(scheduler,/mode === 'shadow' \|\| mode === 'guarded'/)
 assert.match(foundation,/monitoring_queue_one_open_per_watch_idx[\s\S]*where completed_at is null/)
 assert.doesNotMatch(migration,/monitoring_run_limits|reserve_monitoring_run_allowance|subscription|monthly_run/)
})
