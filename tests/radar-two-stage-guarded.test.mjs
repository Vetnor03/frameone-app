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
test('mode is explicit and passed by every recordSuccess call',()=>{
  assert.match(source,/function recordSuccess\(db:any,job:any,source:any,r:any,mode:string\)/)
  const beforeDefinition=source.slice(0,source.indexOf('async function recordSuccess'))
  const calls=[...beforeDefinition.matchAll(/recordSuccess\(([^\n]+)\)/g)]
  assert.equal(calls.length,2); for(const call of calls) assert.match(call[1],/},mode$/)
})
test('failed paid runs preserve the last successful discovery timestamp',()=>{
  const success=worker.slice(worker.indexOf('try {',worker.indexOf('runReason')),worker.indexOf('} catch',worker.indexOf('runReason')))
  const failure=worker.slice(worker.indexOf('} catch',worker.indexOf('runReason')))
  assert.match(success,/provider === 'openai'[^\n]*last_full_discovery_at/); assert.doesNotMatch(failure,/last_full_discovery_at/)
})
test('unsafe strong-source decisions are safety fallbacks, not legacy runs',()=>{
  assert.match(migration,/reason in \('missing_sources','sources_missing_stale_or_failing','eligibility_uncertain'\) then 'safety_fallback'/)
  assert.match(migration,/when not can_gate then 'legacy_adaptive'/)
  assert.match(source,/enqueue_monitoring_safety_fallback/); assert.match(source,/guarded_decision_rpc_error/)
  assert.match(migration,/values\(p_watch_id,'safety_fallback'\) on conflict do nothing/)
})
test('invalid discovery interval and guarded scheduler RPC errors fail open',()=>{
  assert.match(scheduler,/Number\.isFinite\(discoveryHoursRaw\)/)
  assert.match(scheduler,/guardedConfigValid && discoveryHoursValid/)
  assert.match(scheduler,/error && enqueueRpc === 'enqueue_due_guarded_monitoring_watches'/)
  assert.match(scheduler,/supabase\.rpc\('enqueue_due_monitoring_watches'/)
})
function stableDetail({url,selected=1,seen=2,fingerprint='sha256',role='unknown'}) {
  const path=new URL(url).pathname
  const detail=/^\/[^/?#]{2,}\/[^/?#]{2,}\/?$/.test(path)
  const excluded=/(^|\/)(news|blog|articles?|search|results?|categor(?:y|ies)|tags?|collections?|login|sign-?in|cart|account|checkout|track(?:ing)?)(\/|$)/i.test(path)
  return selected>=1&&(seen>=2||selected>=2)&&Boolean(fingerprint)&&detail&&!excluded&&!['article','feed'].includes(role)
}
test('repeated grounded HTML detail pages receive the generic stable role',()=>{
  assert.equal(stableDetail({url:'https://retailer.example/maker/widget-combo'}),true)
  assert.match(migration,/source_role:='stable_detail'/); assert.match(migration,/trg_promote_stable_monitoring_source/)
  assert.match(migration,/selected_count>=1 and \(s\.seen_count>=2 or s\.selected_count>=2\)/)
})
test('home, category, search, tag, and news paths cannot become stable details',()=>{
  for(const url of ['https://example.test/','https://example.test/category/widgets','https://example.test/search/widgets','https://example.test/tag/widgets','https://example.test/news/widget-launch','https://example.test/blog/widget-launch']) assert.equal(stableDetail({url}),false,url)
})
test('once-seen unknown pages cannot become stable details',()=>{
  assert.equal(stableDetail({url:'https://retailer.example/maker/widget-combo',seen:1}),false)
  assert.equal(stableDetail({url:'https://retailer.example/maker/widget-combo',fingerprint:''}),false)
})
test('backfill distinguishes grounded selections and upgrades existing unknown details',()=>{
  assert.match(migration,/selected:=selected\|\|coalesce\(r\.raw_result->'sources'/)
  assert.match(migration,/discovered\|\|selected,selected,w\.original_request/)
  assert.match(migration,/source_role='stable_detail'[\s\S]*source_role='unknown'[\s\S]*is_stable_grounded_detail/)
})
