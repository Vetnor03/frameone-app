import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20260718190000_add_ai_watch_canonical_dedup.sql', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts', import.meta.url), 'utf8')
const interpreter = readFileSync(new URL('../supabase/functions/interpret-ai-assistant/index.ts', import.meta.url), 'utf8')
const provider = readFileSync(new URL('../supabase/functions/_shared/monitoring/provider.ts', import.meta.url), 'utf8')

test('canonical search schema is private, keyed, cached, and concurrency guarded', () => {
  assert.match(migration, /create table if not exists public\.monitoring_canonical_searches/)
  assert.match(migration, /canonical_key text not null unique/)
  assert.match(migration, /canonical_intent jsonb not null/)
  assert.match(migration, /create table if not exists public\.monitoring_shared_runs/)
  assert.match(migration, /monitoring_shared_runs_one_running_idx[\s\S]*where status = 'running'/)
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_canonical_search_id::text, 42\)\)/)
  assert.match(migration, /revoke all on public\.monitoring_canonical_searches from anon, authenticated/)
  assert.match(migration, /revoke all on public\.monitoring_shared_runs from anon, authenticated/)
})

test('interpretation assigns canonical intent while user watch edits move independently', () => {
  assert.match(provider, /export type CanonicalWatchIntent/)
  assert.match(provider, /topic: string[\s\S]*location: string \| null[\s\S]*entities: string\[\][\s\S]*intent: string[\s\S]*filters: string\[\][\s\S]*time_horizon: string \| null[\s\S]*update_requirements: string\[\]/)
  assert.match(provider, /football[\s\S]*soccer/)
  assert.match(interpreter, /canonicalizeWatchIntent/)
  assert.match(interpreter, /p_canonical_key: canonicalKey/)
  assert.match(migration, /canonical_search_id=null, canonical_key=null, canonical_intent=null/)
  assert.match(migration, /enqueue_ai_assistant_interpretation\(updated_watch\.id, updated_watch\.owner_user_id, updated_watch\.original_request, now\(\)\)/)
})

test('worker reuses fresh shared results before paid OpenAI runs and fans out per user watch', () => {
  assert.ok(worker.indexOf("claim_monitoring_shared_run") < worker.indexOf("reserve_paid_monitoring_run"))
  assert.match(worker, /sharedClaim\?\.action === 'cache'/)
  assert.match(worker, /provider: 'cache', model: 'shared-canonical-cache'/)
  assert.match(worker, /cachedResult \?\? \(provider === 'openai'[\s\S]*runOpenAIWatch/)
  assert.match(worker, /from\('monitoring_updates'\)\.insert\(\{ watch_id: watch\.id/)
  assert.match(worker, /complete_monitoring_shared_run/)
  assert.match(worker, /canonical_search_already_running/)
})
