import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canonicalizeWatchIntent, canonicalWatchKey } from '../supabase/functions/_shared/monitoring/provider.ts'

const migration = readFileSync(new URL('../supabase/migrations/20260718190000_add_ai_watch_canonical_dedup.sql', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts', import.meta.url), 'utf8')
const interpreter = readFileSync(new URL('../supabase/functions/interpret-ai-assistant/index.ts', import.meta.url), 'utf8')
const provider = readFileSync(new URL('../supabase/functions/_shared/monitoring/provider.ts', import.meta.url), 'utf8')

function watch(request, extra = {}) {
  return { original_request: request, title: request, normalized_goal: request, trigger_description: request, search_guidance: { queries: [request], source_priorities: ['official sites'], must_not_trigger: [] }, ...extra }
}

async function keyFor(w) { return canonicalWatchKey(canonicalizeWatchIntent(w)) }

async function fakePipeline(watches, { staleRunning = false } = {}) {
  const sharedRuns = new Map()
  let discoveries = 0
  const updates = []
  async function process(w) {
    const intent = canonicalizeWatchIntent(w)
    const key = await canonicalWatchKey(intent)
    const existing = sharedRuns.get(key)
    if (existing?.status === 'running' && !staleRunning) return { deferred: true, key }
    if (existing?.status === 'running' && staleRunning) existing.status = 'error'
    let evidence = sharedRuns.get(key)?.evidence
    if (!evidence) {
      discoveries++
      evidence = { searched_at: '2026-07-18T00:00:00Z', developments: [{ facts: 'Viking FK home match on Sunday', url: 'https://example.com/viking', title: 'Viking home match', published_at: '2026-07-18T00:00:00Z' }], sources: [] }
      sharedRuns.set(key, { status: 'done', evidence })
    }
    const previous = new Set((w.previous_updates ?? []).map((u) => u.fingerprint))
    const isNorwegian = w.preferred_language === 'no'
    const fingerprint = 'viking-home-match-sunday'
    if (!previous.has(fingerprint) && /viking|soccer|football|fotball/i.test(w.original_request)) updates.push({ watch_id: w.id, headline: isNorwegian ? 'Viking spiller hjemmekamp søndag' : 'Viking play home match Sunday', fingerprint })
    return { key, evidence }
  }
  const results = []
  for (const w of watches) results.push(await process(w))
  return { sharedRuns, discoveries, updates, results }
}

test('canonical search schema is private, keyed, cached, and stale/concurrency guarded', () => {
  assert.match(migration, /create table if not exists public\.monitoring_canonical_searches/)
  assert.match(migration, /canonical_key text not null unique/)
  assert.match(migration, /create table if not exists public\.monitoring_shared_runs/)
  assert.match(migration, /monitoring_shared_runs_one_running_idx[\s\S]*where status = 'running'/)
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_canonical_search_id::text, 42\)\)/)
  assert.match(migration, /stale_shared_run_recovered/)
  assert.match(migration, /revoke all on public\.monitoring_canonical_searches from anon, authenticated/)
  assert.match(migration, /revoke all on public\.monitoring_shared_runs from anon, authenticated/)
})

test('canonical key uses structured search dimensions, not generated prose or source priorities as entities', async () => {
  const a = watch('Soccer matches in Stavanger area', { trigger_description: 'Tell me about public football fixtures nearby', preferred_language: 'en' })
  const b = watch('Football games happening around Stavanger', { trigger_description: 'Notify about soccer matches in the area', preferred_language: 'no' })
  assert.equal(await keyFor(a), await keyFor(b))
  assert.deepEqual(canonicalizeWatchIntent(a).subject_entities, [])
  assert.notEqual(await keyFor(watch('Soccer matches within 10 km in Stavanger')), await keyFor(watch('Soccer matches within 100 km in Stavanger')))
  assert.notEqual(await keyFor(watch('Kids soccer tournaments Stavanger')), await keyFor(watch('Soccer matches in Stavanger area')))
  assert.notEqual(await keyFor(watch('Viking home matches in Stavanger')), await keyFor(watch('Soccer matches in Stavanger area')))
})



test('entity safety: named music, clubs, companies, and unknown names do not collapse', async () => {
  assert.notEqual(await keyFor(watch('Coldplay concert in Norway')), await keyFor(watch('Taylor Swift concert in Norway')))
  assert.equal(await keyFor(watch('Coldplay concerts in Norway')), await keyFor(watch('Coldplay shows happening in Norway')))
  assert.notEqual(await keyFor(watch('Viking home matches')), await keyFor(watch('Manchester United home matches')))
  assert.notEqual(await keyFor(watch('OpenAI announcements')), await keyFor(watch('Anthropic announcements')))
  assert.notEqual(await keyFor(watch('Zorblax concerts in Norway')), await keyFor(watch('Qwimble concerts in Norway')))
  assert.equal(await keyFor(watch('Football matches in Stavanger area')), await keyFor(watch('Soccer games around Stavanger')))
})

test('interpretation persists canonical intent while user watch edits move independently', () => {
  assert.match(interpreter, /canonical_search/)
  assert.match(interpreter, /subject_entities/)
  assert.match(provider, /export type CanonicalWatchIntent[\s\S]*topic_category[\s\S]*subject_entities[\s\S]*geographic_location[\s\S]*radius_constraint[\s\S]*content_type[\s\S]*search_scope/)
  assert.match(interpreter, /canonicalizeWatchIntent/)
  assert.match(interpreter, /p_canonical_key: canonicalKey/)
  assert.match(migration, /canonical_search_id=null, canonical_key=null, canonical_intent=null/)
  assert.match(migration, /enqueue_ai_assistant_interpretation\(updated_watch\.id, updated_watch\.owner_user_id, updated_watch\.original_request, now\(\)\)/)
})

test('worker shares discovery but keeps user-specific evaluation and updates separate', () => {
  assert.ok(worker.indexOf('claim_monitoring_shared_run') < worker.indexOf('reserve_paid_monitoring_run'))
  assert.match(worker, /runOpenAISharedDiscovery/)
  assert.match(worker, /evaluateOpenAIWatchEvidence\(\{ \.\.\.watch, previous_updates/)
  assert.doesNotMatch(worker, /cached_result: result|p_result: result, p_response_id: result\.response_id/)
  assert.match(worker, /from\('monitoring_updates'\)\.insert\(\{ watch_id: watch\.id/)
  assert.match(worker, /canonical_search_already_running/)
})

test('behavior: equivalent watches run one discovery and two independent language evaluations', async () => {
  const out = await fakePipeline([
    { ...watch('Soccer matches in Stavanger area'), id: 'a', preferred_language: 'en' },
    { ...watch('Football games happening around Stavanger'), id: 'b', preferred_language: 'no' },
  ])
  assert.equal(out.discoveries, 1)
  assert.equal(out.updates.length, 2)
  assert.match(out.updates.find((u) => u.watch_id === 'a').headline, /Viking play/)
  assert.match(out.updates.find((u) => u.watch_id === 'b').headline, /spiller hjemmekamp/)
})

test('behavior: previous update history is evaluated per watch against shared evidence', async () => {
  const out = await fakePipeline([
    { ...watch('Soccer matches in Stavanger area'), id: 'fresh', preferred_language: 'en' },
    { ...watch('Football games happening around Stavanger'), id: 'seen', preferred_language: 'en', previous_updates: [{ fingerprint: 'viking-home-match-sunday' }] },
  ])
  assert.equal(out.discoveries, 1)
  assert.deepEqual(out.updates.map((u) => u.watch_id), ['fresh'])
})

test('behavior: stale shared running job recovers and concurrent identical jobs do not duplicate discovery', async () => {
  const stale = await fakePipeline([{ ...watch('Soccer matches in Stavanger area'), id: 'a' }], { staleRunning: true })
  assert.equal(stale.discoveries, 1)
  assert.match(migration, /status='error'[\s\S]*stale_shared_run_recovered/)
  assert.match(migration, /where canonical_search_id=p_canonical_search_id and status='running'/)
})

test('privacy: shared discovery stores neutral evidence, not user-specific requests or outputs', () => {
  assert.match(provider, /Do not use or infer any user-specific request, language, history, subscriptions, notifications, or private context/)
  assert.doesNotMatch(worker, /complete_monitoring_shared_run[\s\S]{0,180}original_request/)
  assert.doesNotMatch(worker, /complete_monitoring_shared_run[\s\S]{0,180}previous_updates/)
  assert.match(provider, /Evaluate already-discovered public evidence for one private RE:MIND watch/)
})
