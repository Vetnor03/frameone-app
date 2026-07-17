import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20260716213000_complete_instant_watch_plans.sql', import.meta.url), 'utf8')
const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const subscription = readFileSync(new URL('../app/components/SubscriptionSettingsPage.tsx', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts', import.meta.url), 'utf8')
const scheduler = readFileSync(new URL('../supabase/functions/monitoring-scheduler/index.ts', import.meta.url), 'utf8')
const frameRefresh = readFileSync(new URL('../supabase/migrations/20260715203000_disable_ai_assistant_frame_refresh_requests.sql', import.meta.url), 'utf8')

const instantRpc = migration.match(/function public\.set_ai_assistant_watch_instant[\s\S]*?end \$\$;/)?.[0] ?? ''
const previewRpc = migration.match(/function public\.preview_ai_subscription_plan[\s\S]*?end \$\$;/)?.[0] ?? ''

test('Instant slots count paused/error but not completed, deleted, or shared non-owner Watches', () => {
  assert.match(instantRpc, /owner_user_id=auth\.uid\(\) and is_instant and status in \('active','paused','error'\)/)
  assert.match(instantRpc, /watch_not_found_or_not_owned/)
  assert.doesNotMatch(instantRpc, /status='active'/)
})

test('Instant enable is race safe, immediately due, and preserves stable errors', () => {
  assert.match(instantRpc, /pg_advisory_xact_lock/)
  assert.match(instantRpc, /next_check_at=least\(coalesce\(next_check_at,now\(\)\),now\(\)\)/)
  for (const error of ['subscription_required', 'instant_not_available', 'instant_watch_limit_reached', 'watch_not_found_or_not_owned']) assert.match(instantRpc, new RegExp(error))
})

test('due selection and worker enforce eligibility and exactly 15-minute cadence', () => {
  assert.match(migration, /get_monitoring_watch_schedule_eligibility/)
  assert.match(migration, /status='active' and monitoring_enabled/)
  assert.match(migration, /instant_rank<=max_instant_watches/)
  assert.match(worker, /completedAt\.getTime\(\) \+ 15 \* MINUTES/)
  assert.match(worker, /nextPolicy\.nextCheckAt/)
  assert.doesNotMatch(worker, /instant[\s\S]{0,100}\+ 5 \* MINUTES/i)
  assert.match(scheduler, /enqueue_due_monitoring_watches/)
})

test('paused and inactive Instant Watches do not run, while paused still occupies a slot', () => {
  assert.match(worker, /watch\?\.status === 'paused'/)
  assert.match(migration, /status='active' and monitoring_enabled/)
  assert.match(instantRpc, /'active','paused','error'/)
})

test('preview downgrade keeps deterministic oldest subset and never deletes Watches', () => {
  assert.match(previewRpc, /row_number\(\) over\(order by created_at,id\)/)
  assert.match(previewRpc, /when 'trial' then 1 when 'normal' then 1 when 'pro' then 5 else 0/)
  assert.match(previewRpc, /set is_instant=false/)
  assert.doesNotMatch(previewRpc, /delete from public\.monitoring_watches/)
  assert.doesNotMatch(previewRpc, /p_user_id/)
})

test('owned Radar toggles stay switchable off when slots are full and shared Watches have no toggle', () => {
  assert.match(assistant, /role="switch"/)
  assert.match(assistant, /disabled=\{busy \|\| \(!w\.is_instant && cannotEnableInstant\)\}/)
  assert.match(assistant, /\{canManageWatch && <div[\s\S]*role="switch"/)
  assert.match(assistant, /set_ai_assistant_watch_instant/)
  assert.match(assistant, /Radar Watches/)
  assert.match(assistant, /Turn on Radar/)
  assert.match(assistant, /Turn off Radar/)
  assert.match(assistant, /Slå på Radar/)
  assert.match(assistant, /Slå av Radar/)
})

test('cards have exact totals, Radar subsets, and no negative Basic allowance wording', () => {
  for (const total of [2, 3, 5, 10]) assert.match(subscription, new RegExp(`Up to ${total} Watches`))
  assert.match(subscription, /Radar on 1 Watch/)
  assert.match(subscription, /Radar on up to 5 Watches/)
  assert.doesNotMatch(subscription, /No Radar|Ingen Radar/)
  assert.doesNotMatch(subscription + assistant + migration, new RegExp(['un' + 'limited', 'ube' + 'grenset', 'no ' + 'limits', 'in' + 'finite'].join('|'), 'i'))
})

test('user-facing copy hides the old name, cadence, cost controls, and dollar subscription prices', () => {
  const userFacing = subscription + assistant
  assert.doesNotMatch(userFacing, /Instant Watch|Instant checks|Instant monitoring|Øyeblikkelig|every 15 minutes|15-minute checks|cost-efficient|kostnadseffektiv|\$(?:5|10|20)|USD/i)
  assert.match(assistant, /All Radar slots are in use\./)
  assert.match(assistant, /Alle Radar-plassene er i bruk\./)
  assert.match(assistant, /Radar is available with Normal and Pro\./)
  assert.match(assistant, /Radar er tilgjengelig med Normal og Pro\./)
})

test('internal Instant fields and RPC names remain unchanged', () => {
  for (const name of ['is_instant', 'max_instant_watches', 'can_use_instant', 'instant_check_interval_minutes', 'set_ai_assistant_watch_instant']) assert.match(assistant + migration, new RegExp(name))
})

test('frame refresh remains disabled and app loading only reads stored data', () => {
  assert.match(frameRefresh, /drop function if exists public\.request_ai_assistant_frame_content_refresh/)
  assert.doesNotMatch(assistant, /monitoring-scheduler|monitoring-worker|enqueue_due_monitoring_watches/)
})
