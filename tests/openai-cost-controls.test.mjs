import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('high-volume AI defaults to Luna, blocks old Sol overrides, and disables reasoning overhead', () => {
  const helper = read('app/lib/server/openaiUsage.mjs')
  const weather = read('app/lib/server/weatherInsight.mjs')
  const titles = read('app/lib/frameContentOptimizer.ts')
  assert.match(helper, /fallback = 'gpt-6-luna'/)
  assert.match(helper, /EXPENSIVE_MODEL_RE = \/\^gpt-5\\\.6/)
  assert.match(weather, /costControlledModel\(options\.model \?\? process\.env\.FRAME_AI_MODEL\)/)
  assert.match(titles, /DEFAULT_MODEL = 'gpt-6-luna'/)
  assert.match(titles, /costControlledModel\(process\.env\.FRAME_AI_MODEL, DEFAULT_MODEL\)/)
  assert.match(weather, /reasoning: \{ effort: 'none' \}/)
  assert.match(titles, /reasoning: \{ effort: 'none' \}/)
})

test('weather AI is durable, sparse and budget gated', () => {
  const weather = read('app/lib/server/weatherInsight.mjs')
  assert.match(weather, /weather_ai_insight_cache/)
  assert.match(weather, /noteworthyDryShift/)
  assert.match(weather, /if \(deterministic\) return deterministic/)
  assert.match(weather, /reserveBackgroundOpenAICall\('weather_insight'/)
  assert.match(weather, /durable cache unavailable; skipping AI/)
})

test('title optimizer skips titles that already fit and is budget gated', () => {
  const optimizer = read('app/lib/frameContentOptimizer.ts')
  assert.match(optimizer, /item\.title\.length <= maxChars/)
  assert.match(optimizer, /reserveBackgroundOpenAICall\('frame_title_optimizer'/)
})

test('user-triggered lightweight AI uses the cost-controlled model resolver and records usage', () => {
  const files = [
    ['app/lib/reminders/parser.ts', 'reminder_parse'],
    ['app/lib/surf/commentAnalysis.ts', 'surf_comment'],
    ['app/api/groceries/recipes/import/route.ts', 'recipe_import'],
    ['app/api/assistant/route.ts', 'assistant_intent'],
  ]
  for (const [path, feature] of files) {
    const source = read(path)
    assert.match(source, /costControlledModel/)
    assert.match(source, /reasoning: \{ effort: 'none' \}/)
    assert.match(source, new RegExp(`recordOpenAIUsage\\('${feature}'`))
  }
})

test('AI Follow backend is unconditionally hard-disabled', () => {
  for (const path of [
    'supabase/functions/interpret-ai-assistant/index.ts',
    'supabase/functions/monitoring-scheduler/index.ts',
    'supabase/functions/monitoring-worker/index.ts',
    'supabase/functions/monitoring-source-worker/index.ts',
  ]) {
    const source = read(path)
    assert.match(source, /return Response\.json\(\{ ok: false, disabled: true, feature: 'ai_follow' \}/)
    assert.doesNotMatch(source, /AI_FOLLOW_ENABLED/)
  }
  const provider = read('supabase/functions/_shared/monitoring/provider.ts')
  assert.match(provider, /DEFAULT_OPENAI_MONITORING_MODEL = 'gpt-6-luna'/)
})

test('database migration provides usage ledger, hard budget and durable weather cache', () => {
  const migration = read('supabase/migrations/20260924183000_add_openai_cost_controls.sql')
  assert.match(migration, /create table if not exists public\.openai_usage_events/)
  assert.match(migration, /reserve_openai_background_call/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /create table if not exists public\.weather_ai_insight_cache/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /grant execute on function public\.reserve_openai_background_call.*service_role/)
})

test('background AI fails closed when budget infrastructure is unavailable', () => {
  const helper = read('app/lib/server/openaiUsage.mjs')
  assert.match(helper, /missing_supabase_admin/)
  assert.match(helper, /return \{ allowed: false, id: null \}/)
  assert.match(helper, /OPENAI_BACKGROUND_BUDGET_BYPASS/)
})
