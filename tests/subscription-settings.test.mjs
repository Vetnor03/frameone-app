import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const settings = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const subscription = readFileSync(new URL('../app/components/SubscriptionSettingsPage.tsx', import.meta.url), 'utf8')

test('Subscription is localized and appears between Font size and Privacy policy', () => {
  assert.match(settings, /subscription: 'Subscription'/)
  assert.match(settings, /subscription: 'Abonnement'/)
  assert.match(settings, /SettingRow label=\{t\.fontSizeRow\}[\s\S]*SettingRow label=\{t\.subscription\}[\s\S]*SettingRow label=\{t\.privacyPolicy\}/)
})

test('Subscription row opens an in-app Settings subpage with a back action', () => {
  assert.match(settings, /onClick=\{\(\) => setSubpage\('subscription'\)\}/)
  assert.match(settings, /return <SubscriptionSettingsPage language=\{language\} onBack=\{\(\) => setSubpage\(null\)\}/)
  assert.doesNotMatch(settings, /type (?:Core)?TabKey[^\n]*subscription/)
})

test('canonical entitlements load for the authenticated user', () => {
  assert.match(subscription, /supabase\.auth\.getUser\(\)/)
  assert.match(subscription, /supabase\.rpc\('get_ai_subscription_entitlements', \{ p_user_id: userId \}\)\.maybeSingle\(\)/)
})

test('development switching uses the preview RPC and refreshes entitlements', () => {
  assert.match(subscription, /supabase\.rpc\('preview_ai_subscription_plan', \{ p_plan: plan \}\)/)
  assert.match(subscription, /if \(previewError\) throw previewError\s+await loadEntitlements\(\)/)
  assert.match(subscription, /Temporary development preview/)
  assert.match(subscription, /No payment is made\./)
})

test('Pro advertises exactly five Instant Watches checked every 15 minutes', () => {
  assert.match(subscription, /'Up to 5 Instant Watches', 'Instant checks every 15 minutes'/)
  assert.doesNotMatch(subscription, /Up to (?!5\b)\d+ Instant Watches/)
})

test('Subscription UI introduces no billing integration or real-payment claims', () => {
  assert.doesNotMatch(subscription, /stripe|checkout|invoice|customer[_ ]id|subscription[_ ]id/i)
  assert.doesNotMatch(subscription, /payment (?:was |has been )?(?:completed|successful|processed)/i)
})
