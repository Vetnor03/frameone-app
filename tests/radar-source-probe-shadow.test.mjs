import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const migration=readFileSync(new URL('../supabase/migrations/20260717120000_add_radar_source_probe_shadow.sql',import.meta.url),'utf8')
const provider=readFileSync(new URL('../supabase/functions/_shared/monitoring/provider.ts',import.meta.url),'utf8')
const paidWorker=readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts',import.meta.url),'utf8')
const sourceWorker=readFileSync(new URL('../supabase/functions/monitoring-source-worker/index.ts',import.meta.url),'utf8')
const probe=readFileSync(new URL('../supabase/functions/_shared/radar/probe.ts',import.meta.url),'utf8')
const scheduler=readFileSync(new URL('../supabase/functions/monitoring-scheduler/index.ts',import.meta.url),'utf8')

test('registry schema, RLS and service-only canonical queues',()=>{
 for(const table of ['monitoring_watch_sources','monitoring_source_probe_queue','monitoring_source_probes']) assert.match(migration,new RegExp(`create table public\\.${table}`))
 assert.match(migration,/unique\(watch_id,normalized_url\)/); assert.match(migration,/monitoring_source_probe_one_open_idx[\s\S]*where completed_at is null/)
 assert.match(migration,/enable row level security/g); assert.match(migration,/can_access_monitoring_watch/)
 assert.match(migration,/FOR UPDATE SKIP LOCKED/i); assert.match(migration,/revoke execute[\s\S]*claim_monitoring_source_probe_queue/)
})
test('capture separates internal discovery from grounded update sources',()=>{
 assert.match(provider,/discovered_sources/); assert.match(provider,/discovered_sources: returnedSources/)
 assert.match(paidWorker,/register_monitoring_watch_sources/); assert.match(paidWorker,/p_original_request: watch\.original_request/)
 assert.match(paidWorker,/source_urls: result\.sources/); assert.doesNotMatch(paidWorker,/source_urls: result\.discovered_sources/)
 for(const status of ['no_change','change','uncertain']) assert.match(provider,new RegExp(`status: '${status}'`))
})
test('selection is conservative, deterministic and capped at three',()=>{
 assert.match(migration,/seen_count>=2 or selected_count>=2/); assert.match(migration,/source_role in \('status','product','listing','official','feed'\)/)
 assert.match(migration,/row_number\(\) over\(order by probe_priority,source_role,normalized_url,id\)/)
 assert.match(migration,/least\(p_max_active,3\)/); assert.match(migration,/source_role='exact_url'/)
 assert.match(migration,/then 'article'/); assert.match(migration,/probe_eligible boolean not null default false/)
})
test('queue requires active, entitled internal Radar and active eligible source',()=>{
 assert.match(migration,/w\.status='active' and w\.is_instant and e\.eligible and e\.use_instant_cadence/)
 assert.match(migration,/s\.is_active and s\.probe_eligible and s\.disabled_reason is null/)
 assert.match(sourceWorker,/watch\.status!=='active'\|\|!watch\.is_instant\|\|!eligibility\?\.eligible/)
})
test('safe fetch policy and SSRF ranges are explicit',()=>{
 for(const token of ["'http:'", "'https:'",'embedded_credentials','blocked_port','localhost','metadata.google.internal','169','254',"value.startsWith('fc')","value.startsWith('fd')",'/^fe[89ab]/','blocked_dns_address']) assert.ok(probe.includes(token),token)
 assert.match(sourceWorker,/redirect:'manual'/); assert.match(sourceWorker,/redirects<=3/); assert.match(sourceWorker,/await assertPublicDns\(url\)/)
 assert.match(sourceWorker,/RADAR_SOURCE_MAX_BYTES/); assert.match(sourceWorker,/524288/); assert.match(sourceWorker,/RADAR_SOURCE_TIMEOUT_MS/); assert.match(sourceWorker,/8000/)
 assert.doesNotMatch(sourceWorker,/OPENAI|runOpenAIWatch|api\.openai\.com/i)
})
test('normalizers and outcomes preserve meaningful changes while removing noise',()=>{
 assert.match(probe,/normalizeHtml/); assert.match(probe,/cookie\|consent\|advert\|banner/); assert.match(probe,/rendered\|generated\|request time/)
 assert.match(probe,/normalizeXml/); assert.match(probe,/guid','id/); assert.match(probe,/loc/); assert.match(probe,/lastmod/)
 assert.match(probe,/Object\.entries[\s\S]*\.sort/); assert.match(probe,/SHA-256/)
 assert.match(sourceWorker,/status===304/); assert.match(sourceWorker,/source\.content_fingerprint&&source\.content_fingerprint!==fingerprint\?'changed':'unchanged'/)
})
test('bounded errors back off and permanent failures disable only source',()=>{
 assert.match(probe,/\[15,30,60,180,360\]/); assert.match(sourceWorker,/errors>=3/); assert.match(sourceWorker,/is_active:disabled\?false/)
 assert.match(sourceWorker,/response_too_large/); assert.match(sourceWorker,/redirect_limit/); assert.match(sourceWorker,/error_code:code/)
 assert.doesNotMatch(sourceWorker,/body[_:]|raw_body|response_body/)
})
test('shadow scheduler is fail-soft and cannot control paid work',()=>{
 assert.ok(scheduler.indexOf("enqueue_due_monitoring_watches")<scheduler.indexOf("RADAR_SOURCE_PROBE_MODE"))
 assert.match(scheduler,/RADAR_SOURCE_PROBE_MODE'\) === 'shadow'/); assert.match(scheduler,/source_probe_sidecar_failed/)
 assert.doesNotMatch(sourceWorker,/monitoring_queue|monitoring_runs|monitoring_updates|next_check_at/)
 assert.ok(paidWorker.indexOf("supabase.rpc('reserve_paid_monitoring_run'")<paidWorker.indexOf('await runOpenAIWatch'))
})
