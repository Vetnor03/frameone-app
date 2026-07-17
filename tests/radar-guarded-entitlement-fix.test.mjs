import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const fix=readFileSync(new URL('../supabase/migrations/20260717220000_fix_guarded_watch_entitlement.sql',import.meta.url),'utf8')
const foundation=readFileSync(new URL('../supabase/migrations/20260713130000_add_monitoring_watch_foundation.sql',import.meta.url),'utf8')

test('guarded decision uses canonical schedule eligibility without a Watch entitlement column',()=>{
  assert.match(fix,/select \* into e from public\.get_monitoring_watch_schedule_eligibility\(p_watch_id\)/)
  assert.match(fix,/if not e\.eligible or not e\.use_instant_cadence then/)
  assert.doesNotMatch(fix,/w\.monitoring_enabled/)
  const watchTable=foundation.match(/create table if not exists public\.monitoring_watches[\s\S]*?\n\);/)?.[0]
  assert.ok(watchTable,'monitoring_watches definition must remain discoverable')
  assert.doesNotMatch(watchTable,/monitoring_enabled/)
})

test('eligible Instant Radar Watches with healthy relevant strong sources can gate',()=>{
  assert.match(fix,/count\(\*\) filter\(where public\.is_guarded_strong_source\(s\)/)
  assert.match(fix,/content_fingerprint is not null and s\.last_checked_at>=now\(\)-interval '45 minutes'/)
  assert.match(fix,/geography_relevant is true/)
  assert.match(fix,/if healthy_count=0 then[\s\S]*if intent\.intent_state='ambiguous'/)
  assert.match(fix,/return query select true,'healthy_strong_sources'/)
})

test('Phase 2 geography, legacy, fallbacks, signals, discovery, and permissions survive replacement',()=>{
  for(const fragment of [
    "'owner_not_allowlisted'", "'not_strong_source_watch'", "'sources_missing_stale_or_failing'",
    "intent.intent_state='resolved' and relevant_healthy=0", 'monitoring_source_change_signals',
    'last_full_discovery_at', 'make_interval(hours=>', "exception when others then return query select false,'eligibility_uncertain'"
  ]) assert.ok(fix.includes(fragment),fragment)
  assert.match(fix,/revoke execute[\s\S]*from public,anon,authenticated/)
  assert.match(fix,/grant execute[\s\S]*to service_role/)
})
