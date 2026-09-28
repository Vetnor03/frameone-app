import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const sql = readFileSync(new URL('../supabase/staging/pairing_v2_private_foundation_20260928.sql', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/device/pair/v2/start/route.ts', import.meta.url), 'utf8')

test('foundation is a separate staging script, not a production migration', () => {
  assert.match(sql, /STAGING-ONLY REVIEWED FOUNDATION/)
  assert.match(sql, /create schema pairing_v2;/)
  assert.match(sql, /references public\.devices\(device_id\) on delete cascade/)
  assert.doesNotMatch(sql, /\btruncate\b|\bdrop\s+(?:table|schema)\b|\bdelete\s+from\s+public\./i)
  assert.doesNotMatch(sql, /\binsert\s+into\b|\bupdate\s+public\./i)
})

test('private tables store only exact-size verifiers, never plaintext credentials or a display code', () => {
  assert.match(sql, /bootstrap_secret_hash bytea not null[\s\S]*?octet_length\(bootstrap_secret_hash\) = 32/)
  assert.match(sql, /active_token_hash bytea/)
  assert.match(sql, /display_code_mac bytea not null check \(octet_length\(display_code_mac\) = 32\)/)
  assert.match(sql, /polling_secret_hash bytea not null[\s\S]*?octet_length\(polling_secret_hash\) = 32/)
  assert.match(sql, /pending_token_hash bytea/)
  assert.match(sql, /encrypted_delivery_payload bytea/)
  assert.match(sql, /encrypted_payload_expires_at timestamptz/)
  assert.doesNotMatch(sql, /(?:device_token|bootstrap_secret|display_code|polling_secret)\s+(?:text|varchar|jsonb)\b/i)
  assert.doesNotMatch(sql, /gen_random_bytes\(|generate_pair_code|ensure_device_token|start_pairing\(/)
})

test('both private tables deny API roles independently of RLS', () => {
  assert.match(sql, /revoke all on schema pairing_v2 from public, anon, authenticated, service_role;/)
  assert.match(sql, /alter table pairing_v2\.device_credentials enable row level security;/)
  assert.match(sql, /alter table pairing_v2\.pair_sessions enable row level security;/)
  assert.match(sql, /revoke all on all tables in schema pairing_v2[\s\S]*?from public, anon, authenticated, service_role;/)
  assert.match(sql, /revoke all on all functions in schema pairing_v2[\s\S]*?from public, anon, authenticated, service_role;/)
  assert.doesNotMatch(sql, /\bgrant\b|\bcreate\s+policy\b|\bsecurity\s+definer\b/i)
})

test('session is device-bound and cannot remain live twice per device or short code', () => {
  assert.match(sql, /device_id text not null[\s\S]*?references pairing_v2\.device_credentials\(device_id\)/)
  assert.match(sql, /credential_generation integer not null/)
  assert.match(sql, /check \(expires_at > created_at and expires_at <= created_at \+ interval '10 minutes'\)/)
  assert.match(sql, /unique index pair_v2_one_live_session_per_device/)
  assert.match(sql, /unique index pair_v2_one_live_session_per_code/)
  assert.match(sql, /where state in \('pending', 'claimed', 'delivered'\)/)
  assert.match(sql, /check \(attempt_count between 0 and 5\)/)
  assert.match(sql, /check \(delivery_attempt_count between 0 and 3\)/)
})

function loadRoute(isStaging) {
  const transpiled = ts.transpileModule(route, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const dependencies = {
    'next/server': { NextResponse: { json: (value, init = {}) => Response.json(value, init) } },
    '@/app/lib/device/pairingRollout': { legacyPairingQuarantined: () => isStaging },
  }
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', transpiled)(
    (name) => {
      assert.ok(Object.hasOwn(dependencies, name), 'unsafe dependency: ' + name)
      return dependencies[name]
    }, mod, mod.exports,
  )
  return mod.exports
}

test('staging POST refuses v2 enrollment with no credential/session work', async () => {
  const response = await loadRoute(true).POST()
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { error: 'pairing_v2_not_enabled' })
  assert.doesNotMatch(route, /createServiceClient|createClient|\.rpc\(|\.from\(|\.insert\(|req\.json\(/)
})

test('production and unapproved deployments do not expose a v2 endpoint', async () => {
  const response = await loadRoute(false).POST()
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'not_found' })
  assert.match(route, /PAIRING_V2_ENABLED = false as const/)
})
