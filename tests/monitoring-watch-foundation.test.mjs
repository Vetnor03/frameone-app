import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { mockMonitoringResult, stableFingerprint, monitoringJsonSchema } from '../supabase/functions/_shared/monitoring/provider.ts'

const migration = readFileSync(new URL('../supabase/migrations/20260713130000_add_monitoring_watch_foundation.sql', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts', import.meta.url), 'utf8')
const scheduler = readFileSync(new URL('../supabase/functions/monitoring-scheduler/index.ts', import.meta.url), 'utf8')

test('due-watch scheduling uses a single idempotent scheduler and not one cron per watch', () => {
  assert.match(migration, /enqueue_due_monitoring_watches/)
  assert.match(migration, /where status = 'active' and next_check_at <= now\(\)/)
  assert.match(scheduler, /enqueue_due_monitoring_watches/)
})

test('duplicate queue prevention keeps only one open job per watch', () => {
  assert.match(migration, /monitoring_queue_one_open_per_watch_idx[\s\S]*where completed_at is null/)
  assert.match(migration, /on conflict do nothing/)
})

test('retry behavior uses safe claiming and exponential backoff', () => {
  assert.match(migration, /for update skip locked/)
  assert.match(migration, /claimed_at is null or claimed_at < now\(\) - make_interval/)
  assert.match(worker, /Math\.pow\(2, Math\.min\(job\.attempts, 8\)\) \* 5/)
  assert.match(worker, /claimed_at: null, claimed_by: null, run_after:/)
})

test('fingerprint deduplication prevents repeat notifications for the same development', () => {
  assert.equal(stableFingerprint({ fingerprint: ' Coldplay Norway 2026 ' }), 'coldplay-norway-2026')
  assert.match(migration, /constraint monitoring_updates_watch_fingerprint_unique unique \(watch_id, fingerprint\)/)
  assert.match(worker, /23505/)
})

test('shared-frame access follows device_members frame sharing', () => {
  assert.match(migration, /device_members dm where dm\.device_id = w\.frame_id and dm\.user_id = auth\.uid\(\)/)
  assert.match(migration, /Users can read owned or frame shared watches/)
})

test('RLS isolates runs and updates through accessible watches only', () => {
  assert.match(migration, /alter table public\.monitoring_watches enable row level security/)
  assert.match(migration, /alter table public\.monitoring_runs enable row level security/)
  assert.match(migration, /alter table public\.monitoring_updates enable row level security/)
  assert.match(migration, /Users can read runs through accessible watches/)
  assert.match(migration, /Users can read updates through accessible watches/)
})

test('mock provider supports no-change runs', () => {
  const result = mockMonitoringResult('no_change')
  assert.equal(result.status, 'no_change')
  assert.equal(result.trigger_met, false)
  assert.deepEqual(result.sources, [])
})

test('mock provider supports uncertain results without notification material', () => {
  const result = mockMonitoringResult('uncertain')
  assert.equal(result.status, 'uncertain')
  assert.equal(result.trigger_met, false)
  assert.equal(result.headline, null)
})

test('successful update creation requires trigger, sources and fingerprint', () => {
  const result = mockMonitoringResult('change')
  assert.equal(result.status, 'change')
  assert.equal(result.trigger_met, true)
  assert.ok(result.sources.length > 0)
  assert.ok(stableFingerprint(result))
  assert.match(worker, /monitoring_updates'\)\.insert/)
})



test('service-role RPCs are not executable by normal authenticated clients', () => {
  assert.match(migration, /revoke execute on function public\.enqueue_due_monitoring_watches\(integer\) from public, anon, authenticated/)
  assert.match(migration, /revoke execute on function public\.claim_monitoring_queue\(integer,text,integer\) from public, anon, authenticated/)
})

test('running-run uniqueness prevents duplicate simultaneous processing', () => {
  assert.match(migration, /monitoring_runs_one_running_per_watch_idx[\s\S]*where status = 'running'/)
  assert.match(worker, /watch_already_running/)
})

test('OpenAI abstraction uses Responses API web_search_preview and strict schema', () => {
  assert.equal(monitoringJsonSchema.additionalProperties, false)
  assert.match(readFileSync(new URL('../supabase/functions/_shared/monitoring/provider.ts', import.meta.url), 'utf8'), /https:\/\/api\.openai\.com\/v1\/responses/)
  assert.match(readFileSync(new URL('../supabase/functions/_shared/monitoring/provider.ts', import.meta.url), 'utf8'), /tools: \[\{ type: 'web_search_preview' \}\]/)
  assert.match(readFileSync(new URL('../supabase/functions/_shared/monitoring/provider.ts', import.meta.url), 'utf8'), /strict: true/)
})
