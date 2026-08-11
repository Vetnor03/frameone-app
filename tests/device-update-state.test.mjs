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

test('explicit update copy estimates physical display completion without a button-based countdown', () => {
  assert.match(home, /Update in less than 2 minutes/)
  assert.match(home, /Update in less than 15 seconds/)
  assert.match(home, /lastProbeAt \+ 120_000 \+ 15_000/)
  assert.match(home, /remainingSec < 60/)
  assert.match(home, /setExplicitUpdateEstimate\(null\)[\s\S]*setExplicitUpdateStatus\('updated'\)/)
  assert.doesNotMatch(home, /requestedAt \+ 120_000/)
})

test('manual update presentation takes precedence from saving through completion', () => {
  const handler = home.slice(home.indexOf('async function handleExplicitUpdate'), home.indexOf('\n\n  async function logout'))
  const presentation = home.slice(home.indexOf('const nextUpdateText'), home.indexOf('\n\n  useEffect', home.indexOf('const nextUpdateText')))

  // The click enters the manual state before the first awaited save, so the
  // render committed for SAVING can never use the scheduled countdown branch.
  assert.ok(handler.indexOf("setExplicitUpdateStatus('requesting')") < handler.indexOf('await persistSettings(deviceId)'))
  assert.match(handler, /setExplicitUpdateEstimate\(\{ displayAt: null, instant: false \}\)[\s\S]*await persistSettings/)

  // Requesting (save/wait), updating (awake/download/display), and updated
  // (completion) all remain on the manual presentation side of one branch.
  assert.match(presentation, /manualUpdateInProgress = explicitUpdateStatus === 'requesting' \|\| explicitUpdateStatus === 'updating'/)
  assert.match(presentation, /manualUpdatePresentationActive = explicitUpdateStatus !== 'idle'/)
  assert.match(presentation, /manualUpdateInProgress[\s\S]*formatExplicitUpdateEstimate\(\)[\s\S]*manualUpdatePresentationActive[\s\S]*lastUpdatedAt[\s\S]*nextUpdateText/)
  assert.doesNotMatch(presentation, /manualUpdateInProgress[\s\S]*nextUpdateText[\s\S]*formatExplicitUpdateEstimate\(\)/)
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
