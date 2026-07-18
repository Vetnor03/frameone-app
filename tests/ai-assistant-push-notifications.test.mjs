import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const worker = readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260718130000_add_ai_assistant_push_notifications.sql', import.meta.url), 'utf8')
const hardening = readFileSync(new URL('../supabase/migrations/20260718143000_harden_ai_assistant_push_delivery.sql', import.meta.url), 'utf8')
const unregisterMigration = readFileSync(new URL('../supabase/migrations/20260718150000_add_push_subscription_unregister.sql', import.meta.url), 'utf8')
const sender = readFileSync(new URL('../supabase/functions/send-monitoring-update-push/index.ts', import.meta.url), 'utf8')
const sourceWorker = readFileSync(new URL('../supabase/functions/monitoring-source-worker/index.ts', import.meta.url), 'utf8')
const scheduler = readFileSync(new URL('../supabase/functions/monitoring-scheduler/index.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const subscriptionRoute = readFileSync(new URL('../app/api/notifications/subscription/route.ts', import.meta.url), 'utf8')
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

test('one endpoint cannot remain owned by two users and reassignment is service-side', () => {
  assert.match(hardening, /partition by endpoint[\s\S]*delete from public\.user_push_subscriptions/)
  assert.match(hardening, /add constraint user_push_subscriptions_endpoint_unique unique \(endpoint\)/)
  assert.match(hardening, /service_register_push_subscription[\s\S]*on conflict \(endpoint\) do update[\s\S]*set user_id = excluded\.user_id/)
  assert.match(hardening, /drop function if exists public\.register_push_subscription_for_user/)
  assert.match(subscriptionRoute, /authDb\.auth\.getUser\(\)/)
  assert.match(subscriptionRoute, /serviceClient\(\)\.rpc\('service_register_push_subscription'/)
  assert.doesNotMatch(subscriptionRoute, /from\('user_push_subscriptions'\)\.upsert/)
})

test('idempotent delivery and atomic claims prevent duplicate push notifications on retries', () => {
  assert.match(migration, /constraint monitoring_update_push_deliveries_unique unique \(monitoring_update_id, user_id\)/)
  assert.match(migration, /on conflict \(monitoring_update_id, user_id\) do nothing/)
  assert.match(hardening, /function public\.claim_monitoring_update_push_deliveries/)
  assert.match(hardening, /for update skip locked[\s\S]*set status = 'sending'/)
  assert.match(sender, /rpc\('claim_monitoring_update_push_deliveries'/)
  assert.doesNotMatch(sender, /\.select\('\*'\)[\s\S]*\.update\(\{ status: 'sending'/)
  assert.match(sender, /tag: `monitoring-update-\$\{delivery\.monitoring_update_id\}`/)
})

test('worker HTTP failures are fail-soft and leave durable delivery retryable', () => {
  assert.match(worker, /const pushResponse = await fetch/)
  assert.match(worker, /if \(!pushResponse\.ok\) console\.warn\('\[monitoring-worker:push-fail-soft\]'/)
  assert.match(worker, /catch \(pushError\)[\s\S]*push-fail-soft/)
  assert.match(worker, /return \{ job_id: job\.id, watch_id: watch\.id, ok: true/)
})

test('durable bounded retry path processes pending and failed rows without new updates', () => {
  assert.match(hardening, /next_attempt_at timestamptz not null default now\(\)/)
  assert.match(hardening, /status in \('pending','failed'\)/)
  assert.match(hardening, /status = 'sending' and updated_at < now\(\) - interval '15 minutes'/)
  assert.match(hardening, /attempts < greatest\(1, max_attempts\)/)
  assert.match(sender, /PUSH_MAX_ATTEMPTS/)
  assert.match(sender, /nextAttempt\(delivery\.attempts\)/)
  assert.match(scheduler, /send-monitoring-update-push\?limit=\$\{pushLimit\}/)
  assert.match(scheduler, /push_retries/)
})

test('delivery statuses distinguish sent, suppressed, no subscriptions, transient failures and invalid subscriptions', () => {
  assert.match(hardening, /'no_subscription'/)
  assert.match(sender, /if \(sent > 0\)[\s\S]*status: 'sent'/)
  assert.match(sender, /status: 'no_subscription'/)
  assert.match(sender, /status: terminal \? 'suppressed' : 'failed'/)
  assert.match(sender, /!pref\?\.push_enabled[\s\S]*status: 'suppressed'/)
  assert.doesNotMatch(sender, /permission_state !== 'granted'/)
  assert.match(sender, /statusCode === 404 \|\| statusCode === 410[\s\S]*enabled: false/)
  assert.doesNotMatch(sender, /status: 'sent'[\s\S]*sent \? null : 'no_active_subscriptions'/)
})

test('one global notification preference controls delivery and no per-watch settings are introduced', () => {
  assert.match(migration, /create table if not exists public\.user_notification_preferences/)
  assert.match(migration, /push_enabled boolean not null default false/)
  assert.match(sender, /!pref\?\.push_enabled/)
  assert.doesNotMatch(sender, /permission_state !== 'granted'/)
  assert.doesNotMatch(`${migration}\n${hardening}`, /monitoring_watches[\s\S]*notifications_enabled|radar[\s\S]*notifications_enabled|watch_notification/i)
  assert.doesNotMatch(home, /per-Watch notifications|Radar notifications|notifications_enabled/i)
})



test('authHeaders has a stable HeadersInit-compatible return type', () => {
  assert.match(home, /async function authHeaders\(\): Promise<Record<string, string>>/)
  assert.match(home, /headers: \{ 'content-type': 'application\/json', \.\.\.\(await authHeaders\(\)\) \}/)
})

test('device-local permission denial does not disable account-level notifications or sender delivery', () => {
  assert.match(home, /await savePreference\(enabled, 'denied'\)/)
  assert.match(home, /await savePreference\(enabled, granted === 'denied' \? 'denied' : 'default'\)/)
  assert.match(home, /const nextPermission = supported \? Notification\.permission : 'unsupported'/)
  assert.match(sender, /if \(!pref\?\.push_enabled\)/)
  assert.doesNotMatch(sender, /permission_state !== 'granted'/)
})

test('frontend only shows enabled after key, subscription, and preference API responses succeed', () => {
  assert.match(home, /if \(!keyRes\.ok\) throw new Error\('vapid_key_request_failed'\)/)
  assert.match(home, /async function persistPushSubscription/)
  assert.match(home, /const response = await fetch\('\/api\/notifications\/subscription'/)
  assert.match(home, /if \(!response\.ok\) throw new Error\('push_subscription_save_failed'\)/)
  assert.match(home, /if \(!response\.ok\) throw new Error\('notification_preference_save_failed'\)/)
  assert.match(home, /await savePreference\(true, 'granted'\)/)
})







test('deviceReady state is scoped only to NotificationsSetting, not PairFrameForm', () => {
  const notificationBlock = home.slice(home.indexOf('function NotificationsSetting'), home.indexOf('function SettingRow'))
  const pairFrameBlock = home.slice(home.indexOf('function PairFrameForm'), home.indexOf('function MyFramesSection'))
  assert.match(notificationBlock, /const \[deviceReady, setDeviceReady\] = useState\(false\)/)
  assert.doesNotMatch(pairFrameBlock, /deviceReady|setDeviceReady/)
})

test('global account-on state re-registers granted current devices without prompting', () => {
  assert.match(home, /const \[deviceReady, setDeviceReady\] = useState\(false\)/)
  assert.match(home, /async function registerGrantedCurrentDevice\(\)/)
  assert.match(home, /Notification\.permission !== 'granted'\) return false/)
  assert.match(home, /const existing = await registration\.pushManager\.getSubscription\(\)/)
  assert.match(home, /const subscription = existing \?\? await registration\.pushManager\.subscribe/)
  assert.match(home, /await persistPushSubscription\(subscription\)/)
  assert.match(home, /nextEnabled && supported && Notification\.permission === 'granted'[\s\S]*registerGrantedCurrentDevice\(\)\.catch/)
  assert.doesNotMatch(home, /nextEnabled && supported[\s\S]{0,140}Notification\.requestPermission\(\)/)
})

test('account-on but unregistered devices are not shown as ready and need explicit action', () => {
  assert.match(home, /On for account · enable this device/)
  assert.match(home, /Notifications are on for your account, but this device is not ready yet\./)
  assert.match(home, /Aktiver denne enheten/)
  assert.match(home, /enabled && !deviceReady && permission !== 'denied' && permission !== 'unsupported'/)
  assert.match(home, /onClick=\{enableNotifications\}/)
})

test('global switch works both ways without automatic permission prompts', () => {
  assert.match(home, /onClick=\{enabled \? disableNotifications : enableNotifications\}/)
  assert.match(home, /const granted = Notification\.permission === 'granted' \? 'granted' : await Notification\.requestPermission\(\)/)
  assert.match(home, /type="button" disabled=\{busy\}/)
})

test('logout unregisters only the current endpoint fail-soft without disabling global preferences', () => {
  assert.match(home, /async function unregisterCurrentPushSubscription\(\)/)
  assert.match(home, /getRegistration\('\/sw\.js'\)[\s\S]*getSubscription\(\)/)
  assert.match(home, /method: 'DELETE'[\s\S]*endpoint: subscription\.endpoint/)
  assert.match(home, /catch \(error\)[\s\S]*notifications:logout-cleanup-failed[\s\S]*await supabase\.auth\.signOut\(\)/)
  assert.match(unregisterMigration, /function public\.service_unregister_push_subscription/)
  assert.match(unregisterMigration, /where user_id = p_user_id\s+and endpoint = p_endpoint/)
  assert.match(unregisterMigration, /set enabled = false/)
  assert.doesNotMatch(unregisterMigration, /user_notification_preferences[\s\S]*push_enabled = false/)
  assert.match(subscriptionRoute, /export async function DELETE/)
  assert.match(subscriptionRoute, /authDb\.auth\.getUser\(\)/)
  assert.match(subscriptionRoute, /service_unregister_push_subscription/)
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
