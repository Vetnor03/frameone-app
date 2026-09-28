import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const helper = read('app/lib/device/updateStateAuth.ts')
const sql = read('supabase/staging/pairing_v2_physical_auth_issuer_guards_20260928.sql')
const token = 'a1'.repeat(32)
const otherToken = 'b2'.repeat(32)
const deviceId = 'frm_AABBCCDDEEFF'

function makeHarness({ staging = true, mode = 'legacy', legacyToken = 'legacy-device-token', failRpc = false } = {}) {
  const calls = []
  const client = {
    rpc(name, args) {
      calls.push(['rpc', name, args])
      assert.equal(name, 'pair_v2_staging_device_auth_mode')
      if (failRpc) return Promise.resolve({ data: null, error: { message: 'private DB error' } })
      const receivedHash = args.p_candidate_token_hash
      const expectedHash = '\\x' + createHash('sha256').update(Buffer.from(token, 'hex')).digest('hex')
      const actualMode = mode === 'v2-valid-when-matching'
        ? (args.p_device_id === deviceId && receivedHash === expectedHash ? 'v2_valid' : 'v2_denied')
        : mode
      return Promise.resolve({ data: actualMode, error: null })
    },
    from(name) {
      calls.push(['from', name])
      assert.equal(name, 'devices')
      const filter = {
        select(columns) { assert.equal(columns, 'device_id, device_token'); return this },
        eq(field, value) { assert.equal(field, 'device_id'); assert.equal(value, deviceId); return this },
        async maybeSingle() {
          return { data: { device_id: deviceId, device_token: legacyToken }, error: null }
        },
      }
      return filter
    },
  }
  const js = ts.transpileModule(helper, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  const imports = {
    'node:crypto': { createHash },
    '@/app/lib/device/pairingRollout': { legacyPairingQuarantined: () => staging },
    '@/app/lib/supabase/serviceClient': { createServiceClient: () => client },
  }
  new Function('require', 'module', 'exports', js)(
    name => {
      assert.ok(Object.hasOwn(imports, name), 'unknown dependency ' + name)
      return imports[name]
    },
    mod, mod.exports,
  )
  async function authorize(bearer = token, id = deviceId) {
    return mod.exports.authenticatePhysicalDevice(new Request('http://test.local/api/device/status', {
      headers: bearer === null ? {} : { Authorization: 'Bearer ' + bearer },
    }), id)
  }
  return { authorize, calls, client }
}

test('staging v2 accepts exact 256-bit token, hashing decoded bytes rather than ASCII text', async () => {
  const h = makeHarness({ mode: 'v2-valid-when-matching' })
  const result = await h.authorize()
  assert.equal(result.supabase, h.client)
  assert.equal(h.calls.filter(([name]) => name === 'rpc').length, 1)
  assert.equal(h.calls.some(([name]) => name === 'from'), false)
  assert.equal(h.calls[0][2].p_candidate_token_hash,
    '\\x' + createHash('sha256').update(Buffer.from(token, 'hex')).digest('hex'))
})

test('v2 wrong token, wrong device and malformed bearer never fall back to legacy', async () => {
  const h = makeHarness({ mode: 'v2-valid-when-matching', legacyToken: token })
  for (const [bearer, id] of [
    [otherToken, deviceId], [token, 'frm_000000000000'], ['invalid', deviceId],
  ]) {
    const x = await h.authorize(bearer, id)
    assert.deepEqual(x, { error: 'unauthorized', status: 401 })
  }
  assert.equal(h.calls.some(([name]) => name === 'from'), false)
})

test('unactivated or revoked v2 record rejects even a coincident matching old bearer', async () => {
  const h = makeHarness({ mode: 'v2_denied', legacyToken: token })
  assert.deepEqual(await h.authorize(), { error: 'unauthorized', status: 401 })
  assert.equal(h.calls.some(([name]) => name === 'from'), false)
})

test('only a device without a v2 record can take existing legacy auth path', async () => {
  const h = makeHarness({ mode: 'legacy', legacyToken: 'legacy-device-token' })
  const valid = await h.authorize('legacy-device-token')
  assert.equal(valid.supabase, h.client)
  assert.deepEqual(await h.authorize('wrong-token'), { error: 'unauthorized', status: 401 })
  assert.equal(h.calls.filter(([op]) => op === 'from').length, 2)
})

test('production stays legacy-only and never queries staging v2 RPC', async () => {
  const h = makeHarness({ staging: false })
  const valid = await h.authorize('legacy-device-token')
  assert.equal(valid.supabase, h.client)
  assert.equal(h.calls.some(([op]) => op === 'rpc'), false)
})

test('missing bearer, bad auth-mode result and DB errors fail closed', async () => {
  const h = makeHarness()
  assert.deepEqual(await h.authorize(null), { error: 'missing_auth_token', status: 401 })
  for (const mode of ['denied', 'unexpected', 'v2_valid']) {
    const v = makeHarness({ mode })
    // A malformed token must not be accepted, even if an RPC is mocked as valid.
    const result = await v.authorize('bad')
    assert.deepEqual(result, { error: 'unauthorized', status: 401 })
  }
  const failed = makeHarness({ failRpc: true })
  assert.deepEqual(await failed.authorize(), { error: 'internal_error', status: 500 })
  assert.equal(failed.calls.some(([op]) => op === 'from'), false)
})

test('SQL auth RPC is service-only and v2 presence prevents a legacy fallback', () => {
  assert.match(sql, /create function public\.pair_v2_staging_device_auth_mode/)
  assert.match(sql, /security definer[\s\S]*set search_path = ''/)
  assert.match(sql, /c\.device_id is not null/)
  assert.match(sql, /v_active_hash = p_candidate_token_hash/)
  assert.match(sql, /v_active_at is not null/)
  assert.match(sql, /v_revoked_at is not null/)
  assert.match(sql, /and m\.role = 'owner'/)
  assert.match(sql, /return 'v2_denied';/)
  assert.match(sql, /return 'legacy';/)
  assert.match(sql, /revoke all on function public\.pair_v2_staging_device_auth_mode/)
  assert.match(sql, /grant execute on function public\.pair_v2_staging_device_auth_mode[\s\S]*to service_role;/)
  assert.doesNotMatch(sql, /grant execute on function public\.pair_v2_staging_device_auth_mode[\s\S]*to authenticated;/)
})

test('legacy token issuers and direct credential writes deny ALL v2 rows', () => {
  for (const name of [
    'ensure_device_token', 'set_device_token', 'device_pair_status',
    'start_pairing', 'claim_pair_code', 'create_member_pair_code',
  ]) {
    assert.match(sql, new RegExp('-- Guarded legacy function: ' + name))
  }
  assert.match(sql, /create trigger pairing_v2_reject_legacy_token_update/)
  assert.match(sql, /before update of device_token,device_token_hash on public\.devices/)
  assert.match(sql, /raise exception 'legacy_token_disabled_for_v2_device'/)
  assert.match(sql, /return query select false, null::text;/)
  assert.match(sql, /create trigger pairing_v2_reject_owner_reset/)
  assert.match(sql, /create trigger pairing_v2_reject_cascade_delete/)
  assert.match(sql, /raise exception 'v2_device_revocation_required'/)
  assert.doesNotMatch(sql, /\btruncate\b|\bdrop\s+(?:schema|table)\b/i)
  assert.doesNotMatch(sql, /^\$function\$/m, 'Every copied legacy function must end with a statement terminator')
  assert.doesNotMatch(sql, /insert into pairing_v2\.device_credentials/)
})

test('all known physical endpoints use central helper or preserve user membership in ski', () => {
  const centralized = [
    'assistant', 'content-revision', 'content-signature', 'frame-config',
    'groceries', 'refresh-audit', 'refresh', 'render-state',
    'ski-frame', 'status', 'stocks', 'surf-frame', 'update-state',
  ]
  for (const route of centralized) {
    const path = 'app/api/device/' + route + '/route.ts'
    const source = read(path)
    assert.match(source, /authenticatePhysicalDevice/)
    assert.doesNotMatch(source, /device\.device_token\s*===\s*token|device\.device_token\s*!==\s*token/,
      'Old direct device-token comparison: ' + path)
  }
})
