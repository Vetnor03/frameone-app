import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const coreSource = read('app/lib/device/pairingV2ClaimPoll.ts')
const storeSource = read('app/lib/device/pairingV2ClaimPollStore.ts')
const sql = read('supabase/staging/pairing_v2_claim_poll_20260928.sql')
const claimRoute = read('app/api/device/pair/v2/claim/route.ts')
const statusRoute = read('app/api/device/pair/v2/status/route.ts')
const startSource = read('app/lib/device/pairingV2Start.ts')
const codeKey = randomBytes(32)
const throttleKey = randomBytes(32)
const userId = 'ad6e1936-bb73-4753-80a1-ba162cb80e18'
const deviceId = 'frm_AABBCCDDEEFF'
const sessionId = randomUUID()

function load(source, deps) {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', js)(
    (name) => {
      assert.ok(Object.hasOwn(deps, name), 'unexpected import ' + name)
      return deps[name]
    }, mod, mod.exports,
  )
  return mod.exports
}

const core = load(coreSource, {
  'server-only': {},
  'node:crypto': { createHash, createHmac, timingSafeEqual },
})

function fixture() {
  const boot = randomBytes(32).toString('hex')
  const poll = randomBytes(32).toString('hex')
  const verifier = createHash('sha256').update(Buffer.from(boot, 'hex')).digest('hex')
  const pollHash = createHash('sha256').update(Buffer.from(poll, 'hex')).digest('hex')
  const calls = []
  let claimed = false
  const repository = {
    async claim(args) {
      calls.push(['claim', args])
      const expected = createHmac('sha256', codeKey)
        .update('RE:MIND:pair-v2:display-code:v1:ABCD').digest('hex')
      if (args.codeMacHex !== expected) return 'invalid'
      if (claimed) return 'invalid'
      claimed = true
      return 'claimed'
    },
    async readPollVerifier(id, session) {
      calls.push(['verifier', id, session])
      return id === deviceId && session === sessionId
        ? { hashHex: '\\x' + verifier, generation: 3 }
        : null
    },
    async poll(args) {
      calls.push(['poll', args])
      if (args.deviceId !== deviceId || args.sessionId !== sessionId ||
          args.generation !== 3 || args.expectedVerifierHex !== verifier ||
          args.pollingSecretHashHex !== pollHash) return 'unauthorized'
      return claimed ? 'claimed' : 'pending'
    },
  }
  return { boot, poll, verifier, pollHash, repository, calls }
}

function claim(f, pairingCode = 'ABCD', overrides = {}) {
  return core.claimPairingV2({
    verifiedUserId: userId, pairingCode, networkSource: 'trusted-test-network',
    codeHmacKey: codeKey, throttleHmacKey: throttleKey, repository: f.repository,
    ...overrides,
  })
}

function poll(f, overrides = {}) {
  return core.pollPairingV2({
    deviceId, sessionId, bootstrapProofHex: f.boot, pollingSecretHex: f.poll,
    repository: f.repository, ...overrides,
  })
}

test('invalid short code and missing keys fail before any database call', async () => {
  const f = fixture()
  for (const code of ['', 'A', 'ABCI', 'ABCDX', '1234', 'AB<D', 'AB CD']) {
    assert.deepEqual(await claim(f, code), { ok: false, error: 'invalid' })
  }
  assert.deepEqual(await claim(f, 'ABCD', { codeHmacKey: Buffer.alloc(16) }),
    { ok: false, error: 'unavailable' })
  assert.deepEqual(await claim(f, 'ABCD', { throttleHmacKey: Buffer.alloc(0) }),
    { ok: false, error: 'unavailable' })
  assert.deepEqual(await claim(f, 'ABCD', { networkSource: '' }),
    { ok: false, error: 'unavailable' })
  assert.equal(f.calls.length, 0)
})

test('claim sends only keyed digests, never code, network or account in throttle bucket', async () => {
  const f = fixture()
  assert.deepEqual(await claim(f, ' abcd '), { ok: true })
  const request = f.calls[0][1]
  assert.equal(request.verifiedUserId, userId)
  assert.equal(request.codeMacHex,
    createHmac('sha256', codeKey).update('RE:MIND:pair-v2:display-code:v1:ABCD').digest('hex'))
  assert.equal(request.accountMacHex,
    createHmac('sha256', throttleKey).update('RE:MIND:pair-v2:claim-account:v1:' + userId).digest('hex'))
  assert.equal(request.networkMacHex,
    createHmac('sha256', throttleKey).update('RE:MIND:pair-v2:claim-network:v1:trusted-test-network').digest('hex'))
  assert.equal(JSON.stringify(request).includes('trusted-test-network'), false)
  assert.equal(JSON.stringify(request).includes('ABCD'), false)
  assert.equal(JSON.stringify(request).includes(f.boot), false)
  assert.equal(Object.hasOwn(await claim(f), 'device_token'), false)
})

test('second claim never receives another ownership result or secret', async () => {
  const f = fixture()
  assert.deepEqual(await claim(f), { ok: true })
  assert.deepEqual(await claim(f), { ok: false, error: 'invalid' })
})

test('rate-limit and internal failures never reveal other device or token', async () => {
  const f = fixture()
  f.repository.claim = async () => 'rate_limited'
  assert.deepEqual(await claim(f), { ok: false, error: 'rate_limited' })
  f.repository.claim = async () => { throw new Error('PRIVATE DB DATA: device token') }
  assert.deepEqual(await claim(f), { ok: false, error: 'unavailable' })
})

test('dual-proof poll returns pending then claimed, never a token or owner information', async () => {
  const f = fixture()
  const before = await poll(f)
  assert.deepEqual(before, { ok: true, state: 'pending' })
  assert.deepEqual(await claim(f), { ok: true })
  assert.deepEqual(await poll(f), { ok: true, state: 'claimed' })
  const args = f.calls.filter(([kind]) => kind === 'poll').at(-1)[1]
  assert.equal(args.deviceId, deviceId)
  assert.equal(args.sessionId, sessionId)
  assert.equal(args.expectedVerifierHex, f.verifier)
  assert.equal(args.pollingSecretHashHex, f.pollHash)
  assert.equal(JSON.stringify(args).includes(f.boot), false)
  assert.equal(JSON.stringify(args).includes(f.poll), false)
  assert.equal(Object.hasOwn(before, 'device_token'), false)
  assert.equal(Object.hasOwn(before, 'claimed_by_user_id'), false)
})

test('wrong device, session, bootstrap or independent polling secret is denied', async () => {
  const f = fixture()
  for (const overrides of [
    { deviceId: 'frm_000000000000' },
    { sessionId: randomUUID() },
    { bootstrapProofHex: randomBytes(32).toString('hex') },
    { pollingSecretHex: randomBytes(32).toString('hex') },
    { pollingSecretHex: 'abc' },
  ]) {
    assert.deepEqual(await poll(f, overrides), { ok: false, error: 'unauthorized' })
  }
  assert.equal(f.calls.filter(([kind]) => kind === 'poll').length, 1)
})

test('revoked/unknown session and database failures fail closed', async () => {
  const f = fixture()
  f.repository.readPollVerifier = async () => null
  assert.deepEqual(await poll(f), { ok: false, error: 'unauthorized' })
  f.repository.readPollVerifier = async () => { throw new Error('PRIVATE SQL') }
  assert.deepEqual(await poll(f), { ok: false, error: 'unavailable' })
})

test('claim SQL counts nonexistent guesses and locks/rechecks ownership atomically', () => {
  assert.match(sql, /create table pairing_v2\.claim_attempts/)
  assert.match(sql, /scope in \('account', 'network'\)/)
  assert.match(sql, /on conflict \(scope, bucket_mac, window_start\)/g)
  assert.match(sql, /v_account_count > 5/)
  assert.match(sql, /v_network_count > 30/)
  assert.ok(sql.indexOf("values ('account'") < sql.indexOf("values ('network'"))
  assert.match(sql, /for update of d, c/)
  assert.match(sql, /for update;\s+if not found/)
  assert.match(sql, /v_session\.state <> 'pending'/)
  assert.match(sql, /v_session\.expires_at <= now\(\)/)
  assert.match(sql, /v_session\.credential_generation is distinct from v_generation/)
  assert.match(sql, /update public\.devices d\s+set owner_user_id = p_user_id/)
  assert.match(sql, /insert into public\.device_members\(device_id, user_id, role\)/)
  assert.match(sql, /set state = 'claimed'/)
  assert.doesNotMatch(sql, /set device_token\s*=|ensure_device_token|start_pairing\(/)
})

test('poll SQL rejects mismatched secrets and returns only state, never bearer or user data', () => {
  assert.match(sql, /v_verifier is distinct from p_expected_verifier/)
  assert.match(sql, /v_session\.polling_secret_hash is distinct from p_polling_secret_hash/)
  assert.match(sql, /v_owner is distinct from v_session\.claimed_by_user_id/)
  assert.match(sql, /return query select 'pending'::text/)
  assert.match(sql, /return query select 'claimed'::text/)
  assert.match(sql, /return query select 'expired'::text/)
  assert.match(sql, /encrypted_delivery_payload = null/)
  assert.doesNotMatch(sql, /return query select [^;\n]*(device_token|bootstrap_secret|claimed_by_user_id)/)
  assert.match(startSource, /const DOMAIN = 'RE:MIND:pair-v2:display-code:v1:'/)
})

test('new SQL objects are denied to anon and authenticated and expose no private table grants', () => {
  for (const name of ['pair_v2_staging_claim', 'pair_v2_staging_poll_verifier', 'pair_v2_staging_poll']) {
    assert.match(sql, new RegExp('revoke all on function public\\.' + name + '\\('))
    assert.match(sql, new RegExp('grant execute on function public\\.' + name + '\\('))
  }
  assert.match(sql, /alter table pairing_v2\.claim_attempts enable row level security/)
  assert.match(sql, /revoke all on pairing_v2\.claim_attempts from public, anon, authenticated, service_role/)
  assert.doesNotMatch(sql, /grant\s+(?:usage|select|insert|update|delete)\b/i)
})

test('HTTP claim/poll stay disabled and cannot touch any credential issuer or DB', async () => {
  for (const source of [claimRoute, statusRoute]) {
    assert.match(source, /PAIRING_V2_ENABLED = false as const/)
    assert.doesNotMatch(source, /createServiceClient|createPairV2ClaimPollStore|req\.json\(|\.rpc\(|\.from\(/)
    const mod = load(source, {
      'next/server': { NextResponse: { json: (value, init = {}) => Response.json(value, init) } },
      '@/app/lib/device/pairingRollout': { legacyPairingQuarantined: () => true },
    })
    const response = await mod.POST()
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'pairing_v2_not_enabled' })
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const prod = load(source, {
      'next/server': { NextResponse: { json: (value, init = {}) => Response.json(value, init) } },
      '@/app/lib/device/pairingRollout': { legacyPairingQuarantined: () => false },
    })
    assert.equal((await prod.POST()).status, 404)
  }
  assert.match(storeSource, /import 'server-only'/)
  assert.doesNotMatch(storeSource, /console\.(?:log|warn|info)|pollingSecretHex|bootstrapProofHex/)
})
