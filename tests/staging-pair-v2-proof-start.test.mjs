import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const coreSource = readFileSync(new URL('../app/lib/device/pairingV2Start.ts', import.meta.url), 'utf8')
const storeSource = readFileSync(new URL('../app/lib/device/pairingV2StartStore.ts', import.meta.url), 'utf8')
const routeSource = readFileSync(new URL('../app/api/device/pair/v2/start/route.ts', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../supabase/staging/pairing_v2_proof_start_20260928.sql', import.meta.url), 'utf8')

const modules = {
  'node:crypto': { createHash, createHmac, randomBytes,
    timingSafeEqual: (await import('node:crypto')).timingSafeEqual },
}

function transpile(source, deps = modules) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(
    (name) => {
      assert.ok(Object.hasOwn(deps, name), 'Unexpected dependency: ' + name)
      return deps[name]
    }, mod, mod.exports,
  )
  return mod.exports
}

const core = transpile(coreSource)
const KEY = randomBytes(32)

function fixture({ unknown = false, firstOutcome = 'created' } = {}) {
  const proof = randomBytes(32).toString('hex')
  const verifierHash = createHash('sha256').update(Buffer.from(proof, 'hex')).digest('hex')
  const deviceId = 'frm_AABBCCDDEEFF'
  const calls = []
  let active = false
  let collision = firstOutcome === 'collision'
  const repository = {
    async readEligibleVerifier(id) {
      calls.push(['lookup', id])
      return unknown ? null : { hashHex: '\\x' + verifierHash, generation: 7 }
    },
    async openSession(args) {
      calls.push(['open', args])
      if (collision) {
        collision = false
        return { kind: 'collision' }
      }
      if (active || firstOutcome === 'already_active') return { kind: 'already_active' }
      if (firstOutcome === 'ineligible') return { kind: 'ineligible' }
      active = true
      return { kind: 'created', sessionId: randomUUID() }
    },
  }
  return { proof, verifierHash, deviceId, repository, calls }
}

function start(f, proof = f.proof, key = KEY) {
  return core.startPairingV2({
    deviceId: f.deviceId, bootstrapProofHex: proof, displayCodeHmacKey: key,
    repository: f.repository,
  })
}

test('device ID alone and malformed bootstrap proofs never read or create a session', async () => {
  const f = fixture()
  for (const proof of ['', 'not-a-proof', 'abc', 'f'.repeat(63), 'g'.repeat(64)]) {
    assert.deepEqual(await start(f, proof), { ok: false, error: 'unauthorized' })
  }
  assert.equal(f.calls.length, 0)
  const x = { ...f, deviceId: 'frm_SPOOFED' }
  assert.deepEqual(await start(x), { ok: false, error: 'unauthorized' })
  assert.equal(f.calls.length, 0)
})

test('unknown device and incorrect full-length proof give same generic rejection', async () => {
  const f = fixture()
  const unknown = fixture({ unknown: true })
  const wrong = randomBytes(32).toString('hex')
  assert.deepEqual(await start(f, wrong), { ok: false, error: 'unauthorized' })
  assert.deepEqual(await start(unknown), { ok: false, error: 'unauthorized' })
  assert.deepEqual(f.calls.map(([kind]) => kind), ['lookup'])
  assert.deepEqual(unknown.calls.map(([kind]) => kind), ['lookup'])
})

test('missing independent server HMAC key prevents verifier lookup', async () => {
  const f = fixture()
  assert.deepEqual(await start(f, f.proof, Buffer.alloc(0)), { ok: false, error: 'unavailable' })
  assert.deepEqual(await start(f, f.proof, Buffer.alloc(31)), { ok: false, error: 'unavailable' })
  assert.equal(f.calls.length, 0)
})

test('matching physical proof creates one short-lived, MAC-bound session', async () => {
  const f = fixture()
  const result = await start(f)
  assert.equal(result.ok, true)
  assert.match(result.sessionId, /^[0-9a-f-]{36}$/)
  assert.match(result.pairingCode, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/)
  assert.match(result.pollingSecret, /^[a-f0-9]{64}$/)
  assert.equal(result.expiresInSeconds, 600)
  assert.equal(Object.hasOwn(result, 'bootstrapProofHex'), false)

  const open = f.calls.find(([kind]) => kind === 'open')[1]
  assert.equal(open.deviceId, f.deviceId)
  assert.equal(open.generation, 7)
  assert.equal(open.expectedVerifierHex, f.verifierHash)
  assert.equal(open.displayCodeMacHex,
    createHmac('sha256', KEY).update('RE:MIND:pair-v2:display-code:v1:' + result.pairingCode).digest('hex'))
  assert.equal(open.pollingSecretHashHex,
    createHash('sha256').update(Buffer.from(result.pollingSecret, 'hex')).digest('hex'))
  assert.equal(open.displayCodeMacHex.includes(result.pairingCode), false)
  assert.equal(open.pollingSecretHashHex.includes(result.pollingSecret), false)
  assert.equal(JSON.stringify(open).includes(f.proof), false)
})

test('only one active session and no replay with same proof', async () => {
  const f = fixture()
  assert.equal((await start(f)).ok, true)
  assert.deepEqual(await start(f), { ok: false, error: 'already_active' })
  assert.equal(f.calls.filter(([kind]) => kind === 'open').length, 2)
})

test('collision retries with freshly generated MAC/proof material, then succeeds', async () => {
  const f = fixture({ firstOutcome: 'collision' })
  assert.equal((await start(f)).ok, true)
  const openings = f.calls.filter(([kind]) => kind === 'open').map(([, args]) => args)
  assert.equal(openings.length, 2)
  assert.notEqual(openings[0].pollingSecretHashHex, openings[1].pollingSecretHashHex)
})

test('revoked, already-owned or changed-generation response fails closed', async () => {
  const f = fixture({ firstOutcome: 'ineligible' })
  assert.deepEqual(await start(f), { ok: false, error: 'unauthorized' })
  assert.match(sql, /v_generation is distinct from p_generation/)
  assert.match(sql, /v_verifier is distinct from p_expected_verifier/)
  assert.match(sql, /v_owner is not null/)
  assert.match(sql, /v_legacy_token is not null/)
  assert.match(sql, /v_legacy_token_hash is not null/)
  assert.match(sql, /v_revoked is not null/)
  assert.match(sql, /v_active_hash is not null/)
  assert.match(sql, /for update of d, c/)
  assert.match(sql, /from public\.device_members m/)
})

test('repository failures remain generic and do not reflect SQL error details', async () => {
  const f = fixture()
  f.repository.openSession = async () => { throw Error('SECRET: private sql failure') }
  assert.deepEqual(await start(f), { ok: false, error: 'unavailable' })
})

test('private RPCs require service role and never grant schema/table access', () => {
  assert.match(sql, /security definer/g)
  assert.match(sql, /set search_path = ''/g)
  assert.match(sql, /revoke all on function public\.pair_v2_staging_verifier\(text\)[\s\S]*from public, anon, authenticated, service_role;/)
  assert.match(sql, /grant execute on function public\.pair_v2_staging_verifier\(text\) to service_role;/)
  assert.match(sql, /revoke all on function public\.pair_v2_staging_start\(text, integer, bytea, bytea, bytea\)[\s\S]*from public, anon, authenticated, service_role;/)
  assert.match(sql, /grant execute on function public\.pair_v2_staging_start\(text, integer, bytea, bytea, bytea\)[\s\S]*to service_role;/)
  assert.doesNotMatch(sql, /grant\s+(?:usage|select|insert|update|delete)\b/i)
  assert.doesNotMatch(sql, /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.devices\b/i)
  assert.match(sql, /on conflict do nothing/)
  assert.match(sql, /expires_at <= now\(\)/)
  assert.match(sql, /encrypted_delivery_payload = null/)
})

test('disabled v2 HTTP route has no credential or service-role access yet', () => {
  assert.match(routeSource, /PAIRING_V2_ENABLED = false as const/)
  assert.doesNotMatch(routeSource, /createPairV2StartStore|startPairingV2|process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(routeSource, /\.rpc\(|\.from\(|\.insert\(/)
  assert.match(storeSource, /import 'server-only'/)
  assert.doesNotMatch(storeSource, /console\.(log|warn|info)|bootstrapProofHex|pollingSecret:|pairingCode:/)
})
