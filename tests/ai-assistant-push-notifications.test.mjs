import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const worker = readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260718130000_add_ai_assistant_push_notifications.sql', import.meta.url), 'utf8')
const sender = readFileSync(new URL('../supabase/functions/send-monitoring-update-push/index.ts', import.meta.url), 'utf8')
const sourceWorker = readFileSync(new URL('../supabase/functions/monitoring-source-worker/index.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

test('only genuine newly inserted monitoring updates queue push notifications', () => {
  assert.match(worker, /from\('monitoring_updates'\)\.insert[\s\S]*\.select\('id'\)\.single\(\)/)
  assert.match(worker, /if \(!error\) \{[\s\S]*createdUpdate = true[\s\S]*createdUpdateId = insertedUpdate\?\.id/)
  assert.match(worker, /if \(createdUpdate && createdUpdateId\)[\s\S]*queue_monitoring_update_push/)
  assert.doesNotMatch(worker, /queue_monitoring_update_push[\s\S]*status === 'no_change'/)
  assert.match(worker, /status === 'change' && !createdUpdate\) effectiveStatus = 'uncertain'/)
})

test('cheap Radar/source probes and rejected or unchanged checks cannot send push', () => {
  assert.doesNotMatch(sourceWorker, /send-monitoring-update-push|queue_monitoring_update_push|user_push_subscriptions|monitoring_update_push_deliveries/)
  assert.match(sourceWorker, /record_guarded_source_change/)
  assert.match(worker, /result\.status === 'change' && result\.trigger_met \? 'change'/)
  assert.match(worker, /if \(fingerprint && result\.headline && result\.summary && result\.sources\.length > 0\)/)
})

test('idempotent delivery prevents duplicate push notifications on worker retries', () => {
  assert.match(migration, /constraint monitoring_update_push_deliveries_unique unique \(monitoring_update_id, user_id\)/)
  assert.match(migration, /on conflict \(monitoring_update_id, user_id\) do nothing/)
  assert.match(sender, /\.eq\('monitoring_update_id', updateId\)\.in\('status', \['pending','failed'\]\)\.maybeSingle\(\)/)
  assert.match(sender, /tag: `monitoring-update-\$\{updateId\}`/)
})

test('one global notification preference controls delivery', () => {
  assert.match(migration, /create table if not exists public\.user_notification_preferences/)
  assert.match(migration, /push_enabled boolean not null default false/)
  assert.match(sender, /!pref\?\.push_enabled \|\| pref\.permission_state !== 'granted'/)
  assert.doesNotMatch(migration, /monitoring_watches[\s\S]*notifications_enabled|radar[\s\S]*notifications_enabled|watch_notification/i)
  assert.doesNotMatch(home, /per-Watch notifications|Radar notifications|notifications_enabled/i)
})

test('multiple subscriptions per user and invalid subscription cleanup are supported fail-soft', () => {
  assert.match(migration, /create table if not exists public\.user_push_subscriptions/)
  assert.match(migration, /unique \(user_id, endpoint\)/)
  assert.match(sender, /for \(const sub of subs \?\? \[\]\)/)
  assert.match(sender, /statusCode === 404 \|\| statusCode === 410/)
  assert.match(sender, /enabled: false/)
  assert.match(worker, /catch \(pushError\)[\s\S]*push-fail-soft/)
})

test('permission flow is explicit and service worker handles click navigation', () => {
  assert.match(home, /Never miss an important update/)
  assert.match(home, /Get a notification when RE:MIND finds something new/)
  assert.match(home, /Ikke gå glipp av viktige oppdateringer/)
  assert.match(home, /Få et varsel når RE:MIND finner noe nytt/)
  assert.match(home, /Notification\.requestPermission\(\)/)
  assert.match(home, /Notification\.permission === 'denied'/)
  assert.match(home, /'PushManager' in window/)
  assert.match(sw, /self\.addEventListener\('push'/)
  assert.match(sw, /self\.addEventListener\('notificationclick'/)
  assert.match(sw, /clients\.openWindow\(url\)/)
})
