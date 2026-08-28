import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20260809120000_add_device_update_state.sql', import.meta.url), 'utf8')
const auth = readFileSync(new URL('../app/lib/device/updateStateAuth.ts', import.meta.url), 'utf8')
const activity = readFileSync(new URL('../app/api/device/update-state/activity/route.ts', import.meta.url), 'utf8')
const request = readFileSync(new URL('../app/api/device/update-state/request/route.ts', import.meta.url), 'utf8')
const deviceState = readFileSync(new URL('../app/api/device/update-state/route.ts', import.meta.url), 'utf8')
const appStatus = readFileSync(new URL('../app/api/device/update-state/status/route.ts', import.meta.url), 'utf8')
const legacyStatus = readFileSync(new URL('../app/api/device/status/route.ts', import.meta.url), 'utf8')
const legacyRefresh = readFileSync(new URL('../app/api/device/refresh/route.ts', import.meta.url), 'utf8')
const probeMigration = readFileSync(new URL('../supabase/migrations/20260810120000_track_device_update_probes.sql', import.meta.url), 'utf8')
const updateClient = readFileSync(new URL('../app/lib/device/updateStateClient.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const manualRequestMigration = readFileSync(new URL('../supabase/migrations/20260822120000_manual_request_claims_activity.sql', import.meta.url), 'utf8')

test('app operations authenticate a user and require device membership', () => {
  assert.match(auth, /supabase\.auth\.getUser\(token\)/)
  assert.match(auth, /from\('device_members'\)/)
  assert.match(auth, /\.eq\('device_id', deviceId\)/)
  assert.match(auth, /\.eq\('user_id', authData\.user\.id\)/)
  assert.match(activity, /authenticateUserForDevice/)
  assert.match(request, /authenticateUserForDevice/)
  assert.match(appStatus, /authenticateUserForDevice/)
})

test('heartbeat only extends activity and cannot request an update', () => {
  assert.match(migration, /clock_timestamp\(\) \+ interval '2 minutes'/)
  assert.match(migration, /coalesce\(device_update_state\.app_active_until, '-infinity'::timestamptz\)/)
  const heartbeat = migration.slice(migration.indexOf('function public.heartbeat'), migration.indexOf('function public.request'))
  assert.doesNotMatch(heartbeat, /requested_revision\s*=/)
  assert.match(activity, /heartbeat_device_app_activity/)
})

test('requested revisions use one atomic upsert increment', () => {
  const increment = migration.slice(migration.indexOf('function public.request'), migration.indexOf('function public.ack'))
  assert.match(increment, /on conflict \(device_id\) do update/)
  assert.match(increment, /requested_revision = device_update_state\.requested_revision \+ 1/)
  assert.match(request, /requested_revision: data/)
})

test('manual request extends activity and ledger replay cannot increment twice', () => {
  const activity = manualRequestMigration.indexOf('set app_active_until = greatest')
  const ledgerLookup = manualRequestMigration.indexOf('select requested_revision into result')
  const earlyReturn = manualRequestMigration.indexOf('if result is not null then return result')
  const increment = manualRequestMigration.indexOf('set requested_revision = requested_revision + 1')
  assert.ok(activity < ledgerLookup && ledgerLookup < earlyReturn && earlyReturn < increment)
  assert.match(manualRequestMigration, /clock_timestamp\(\) \+ interval '2 minutes'/)
})

test('device probe and ACK use existing per-device bearer authentication', () => {
  assert.match(auth, /from\('devices'\)/)
  assert.match(auth, /device\.device_token !== token/)
  assert.match(deviceState, /authenticatePhysicalDevice/)
  assert.match(deviceState, /app_active:/)
  assert.match(deviceState, /ack_device_display_revision/)
})

test('ACK is monotonic, rejects future revisions, and timestamps only progress', () => {
  const ack = migration.slice(migration.indexOf('function public.ack'))
  assert.match(ack, /greatest\(displayed_revision, p_displayed_revision\)/)
  assert.match(ack, /p_displayed_revision <= requested_revision/)
  assert.match(ack, /when p_displayed_revision > displayed_revision then clock_timestamp\(\)/)
  assert.match(deviceState, /revision_not_requested/)
  assert.match(deviceState, /error\?\.code === '22023'/)
})

test('missing update state has safe zero defaults for both readers', () => {
  for (const route of [deviceState, appStatus]) {
    assert.match(route, /requested_revision: data\?\.requested_revision \?\? 0/)
    assert.match(route, /displayed_revision: data\?\.displayed_revision \?\? 0/)
  }
})

test('RLS denies direct client access and RPC writes are service-role-only', () => {
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all .* from anon, authenticated/)
  assert.doesNotMatch(migration, /create policy/)
  assert.match(migration, /revoke execute .* from public, anon, authenticated/g)
  assert.match(migration, /grant execute .* to service_role/g)
  assert.equal(migration.match(/set search_path = ''/g)?.length, 3)
})

test('first-row heartbeat and request upserts preserve each other state', () => {
  assert.match(migration, /insert into public\.device_update_state \(device_id, app_active_until\)/)
  assert.match(migration, /set app_active_until = greatest/)
  assert.match(migration, /insert into public\.device_update_state \(device_id, requested_revision\)/)
  assert.match(migration, /set requested_revision = device_update_state\.requested_revision \+ 1/)
  assert.doesNotMatch(migration, /set\s+app_active_until[^;]*requested_revision|set\s+requested_revision[^;]*app_active_until/s)
})

test('status and probe GET routes explicitly disable caching', () => {
  for (const route of [deviceState, appStatus]) {
    assert.match(route, /dynamic = 'force-dynamic'/)
    assert.match(route, /revalidate = 0/)
    assert.match(route, /'Cache-Control': 'private, no-store, max-age=0'/)
  }
})

test('physical probes provide a real wake-cycle anchor for the app estimate', () => {
  assert.match(probeMigration, /add column if not exists last_probe_at timestamptz/)
  assert.match(deviceState, /update\(\{ last_probe_at: probedAt \}\)/)
  assert.match(appStatus, /last_probe_at/)
  assert.match(updateClient, /lastProbeAt:/)
})

test('manual update has no estimated countdown or fabricated timestamp', () => {
  assert.doesNotMatch(home, /MANUAL_UPDATE_VISIBLE_MS|manualUpdateEstimate|formatExplicitUpdateEstimate/)
  assert.doesNotMatch(home, /Update in less than|Oppdatering om mindre enn/)
  assert.doesNotMatch(home, /requestedAt \+.*setLastPhysicalDisplayUpdatedAt/)
})

test('manual update keeps physical freshness visible through every operation phase', () => {
  assert.match(home, /explicitUpdateStatus[^\n]*'idle' \| 'saving' \| 'requesting' \| 'waiting_for_display'/)
  assert.match(home, /const updateStatusText = manualUpdateInProgress[\s\S]*lastPhysicalDisplayUpdatedAt/)
  assert.match(home, /manualUpdateInProgress = explicitUpdateStatus === 'saving' \|\| explicitUpdateStatus === 'requesting'/)
  assert.match(home, /Frame hasn’t confirmed the update yet\./)
})

test('desired state stays editable and pending while exact rendered revisions remain monotonic', () => {
  assert.match(home, /setDirty\(desiredStateRef\.current !== persistedSignature\)/)
  assert.match(home, /frameChangesPending = updateRevisions\.requested > updateRevisions\.displayed/)
  assert.match(home, /const actionDisabled = layoutFlow[\s\S]*: !activeDeviceId/)
  assert.match(migration, /greatest\(displayed_revision, p_displayed_revision\)/)
  assert.match(migration, /p_displayed_revision <= requested_revision/)
})

test('idle copy ages the last confirmed physical display render and never predicts a refresh', () => {
  assert.match(home, /setLastPhysicalDisplayUpdatedAt\(renderIso\)/)
  assert.match(home, /formatRelative\(lastPhysicalDisplayUpdatedAt\)/)
  assert.match(home, /activeTab !== 'frame'[\s\S]*setInterval\(\(\) => setNextUpdateTick/)
  assert.doesNotMatch(home, /function formatNextUpdate/)
  assert.doesNotMatch(home, /scheduledPresentation|nextUpdateText/)
  assert.doesNotMatch(home, /setLastPhysicalDisplayUpdatedAt\(new Date\(\)\.toISOString\(\)\)/)
})

test('revision acknowledgement refreshes physical status instead of supplying freshness', () => {
  assert.match(appStatus, /last_displayed_at:/)
  assert.match(home, /revisionHasBeenDisplayed[\s\S]*refreshPhysicalFrameState\(deviceId/)
  assert.doesNotMatch(home, /lastDisplayedAt[^\n]*setLastPhysicalDisplayUpdatedAt/)
})

test('API errors do not expose database messages and device IDs are bounded', () => {
  for (const route of [activity, request, deviceState, appStatus]) {
    assert.doesNotMatch(route, /error\.message/)
  }
  assert.match(auth, /deviceId\.length <= 128/)
  assert.match(auth, /internal_error/)
})

test('legacy device status and refresh contracts remain untouched', () => {
  assert.match(legacyStatus, /export async function GET/)
  assert.match(legacyStatus, /export async function POST/)
  assert.match(legacyRefresh, /return NextResponse\.json\(\{ ok: true \}\)/)
  assert.doesNotMatch(legacyStatus, /requested_revision|displayed_revision|app_active/)
})
