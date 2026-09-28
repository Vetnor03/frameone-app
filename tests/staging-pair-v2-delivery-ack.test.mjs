import assert from 'node:assert/strict'
import {
  createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual,
} from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const coreSource = read('app/lib/device/pairingV2Delivery.ts')
const storeSource = read('app/lib/device/pairingV2DeliveryStore.ts')
const sql = read('supabase/staging/pairing_v2_delivery_ack_20260928.sql')
const deliverHttp = read('app/api/device/pair/v2/deliver/route.ts')
const ackHttp = read('app/api/device/pair/v2/ack/route.ts')
const key = randomBytes(32)
const deviceId = 'frm_AABBCCDDEEFF'
const sessionId = randomUUID()

function load(source, imports) {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', js)(
    (name) => {
      assert.ok(Object.hasOwn(imports, name), 'unexpected import ' + name)
      return imports[name]
    }, mod, mod.exports,
  )
  return mod.exports
}

const core = load(coreSource, {
  'server-only': {},
  'node:crypto': { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual },
})

function fixture() {
  const boot = randomBytes(32).toString('hex')
  const poll = randomBytes(32).toString('hex')
  const verifier = createHash('sha256').update(Buffer.from(boot, 'hex')).digest('hex')
  const pollHash = createHash('sha256').update(Buffer.from(poll, 'hex')).digest('hex')
  let state = 'claimed'
  let ciphertext = null
  let tokenHash = null
  let tries = 0
  const calls = []
  const repo = {
    async readDeliveryVerifier(id, sid) {
      calls.push(['read', id, sid])
      return id === deviceId && sid === sessionId
        ? { hashHex: '\\x' + verifier, generation: 3 }
        : null
    },
    async deliver(input) {
      calls.push(['deliver', input])
      if (input.deviceId !== deviceId || input.sessionId !== sessionId ||
          input.generation !== 3 || input.expectedVerifierHex !== verifier ||
          input.pollingSecretHashHex !== pollHash) return { kind: 'unauthorized' }
      if (state === 'expired') return { kind: 'expired' }
      if (state === 'acknowledged') return { kind: 'unauthorized' }
      if (tries >= 3) return { kind: 'retry_exhausted' }
      if (!ciphertext) {
        ciphertext = input.candidateEnvelopeHex
        tokenHash = input.candidateTokenHashHex
        state = 'delivered'
      }
      tries++
      return { kind: 'delivered', envelopeHex: ciphertext, tokenHashHex: tokenHash }
    },
    async acknowledge(input) {
      calls.push(['ack', input])
      if (input.deviceId !== deviceId || input.sessionId !== sessionId ||
          input.expectedVerifierHex !== verifier ||
          input.pollingSecretHashHex !== pollHash ||
          input.receivedTokenHashHex !== tokenHash) return 'unauthorized'
      if (state === 'acknowledged') return 'already_acknowledged'
      if (state !== 'delivered') return 'unauthorized'
      state = 'acknowledged'
      ciphertext = null
      return 'acknowledged'
    },
  }
  return {
    boot, poll, verifier, pollHash, repo, calls,
    get state() { return state },
    get tries() { return tries },
    expire() { state = 'expired' },
    corrupt() { ciphertext = '01' + '0'.repeat(120) },
  }
}

function base(f) {
  return { deviceId, sessionId, bootstrapProofHex: f.boot, pollingSecretHex: f.poll, repository: f.repo }
}
function deliver(f, extras = {}) {
  return core.deliverPairingV2({ ...base(f), deliveryKey: key, ...extras })
}
function ack(f, receivedTokenHex, extras = {}) {
  return core.acknowledgePairingV2({ ...base(f), receivedTokenHex, ...extras })
}

test('only valid dual physical proofs may begin delivery', async () => {
  const f = fixture()
  for (const extras of [
    { deviceId: 'frm_000000000000' },
    { sessionId: randomUUID() },
    { bootstrapProofHex: randomBytes(32).toString('hex') },
    { bootstrapProofHex: 'AB' },
  ]) assert.deepEqual(await deliver(f, extras), { ok: false, error: 'unauthorized' })
  assert.equal(f.calls.some(([kind]) => kind === 'deliver'), false)

  // Polling-secret verification belongs in the atomic DB RPC; it cannot be
  // established from the bootstrap verifier alone. The RPC must reject it.
  assert.deepEqual(await deliver(f, { pollingSecretHex: randomBytes(32).toString('hex') }),
    { ok: false, error: 'unauthorized' })
  assert.equal(f.state, 'claimed')
})

test('missing or invalid AES-256 key fails before verifier lookup', async () => {
  const f = fixture()
  assert.deepEqual(await deliver(f, { deliveryKey: Buffer.alloc(0) }),
    { ok: false, error: 'unavailable' })
  assert.deepEqual(await deliver(f, { deliveryKey: Buffer.alloc(31) }),
    { ok: false, error: 'unavailable' })
  assert.equal(f.calls.length, 0)
})

test('first delivery stores only hash and AEAD envelope and returns 256-bit token to frame', async () => {
  const f = fixture()
  const response = await deliver(f)
  assert.equal(response.ok, true)
  assert.match(response.tokenHex, /^[0-9a-f]{64}$/)
  const input = f.calls.find(([kind]) => kind === 'deliver')[1]
  assert.equal(input.deviceId, deviceId)
  assert.equal(input.sessionId, sessionId)
  assert.equal(input.expectedVerifierHex, f.verifier)
  assert.equal(input.pollingSecretHashHex, f.pollHash)
  assert.equal(input.candidateEnvelopeHex.length, 122)
  assert.equal(input.candidateEnvelopeHex.slice(0, 2), '01')
  assert.equal(input.candidateTokenHashHex,
    createHash('sha256').update(Buffer.from(response.tokenHex, 'hex')).digest('hex'))
  assert.equal(JSON.stringify(input).includes(response.tokenHex), false)
  assert.equal(JSON.stringify(input).includes(f.boot), false)
  assert.equal(JSON.stringify(input).includes(f.poll), false)
})

test('lost HTTP response retries reuse exactly the same token twice, then stop', async () => {
  const f = fixture()
  const first = await deliver(f)
  const second = await deliver(f)
  const third = await deliver(f)
  const fourth = await deliver(f)
  assert.equal(first.ok, true)
  assert.deepEqual(first, second)
  assert.deepEqual(first, third)
  assert.deepEqual(fourth, { ok: false, error: 'retry_exhausted' })
  assert.equal(f.tries, 3)
  const requests = f.calls.filter(([kind]) => kind === 'deliver')
  assert.notEqual(requests[0][1].candidateTokenHashHex, requests[1][1].candidateTokenHashHex)
})

test('tampered ciphertext is never returned as token; an altered server key fails AEAD', async () => {
  const f = fixture()
  assert.equal((await deliver(f)).ok, true)
  f.corrupt()
  assert.deepEqual(await deliver(f), { ok: false, error: 'unavailable' })

  const separate = fixture()
  assert.equal((await deliver(separate)).ok, true)
  assert.deepEqual(await deliver(separate, { deliveryKey: randomBytes(32) }),
    { ok: false, error: 'unavailable' })
})

test('ACK requires the exact delivered token and both proofs; it never returns the bearer', async () => {
  const f = fixture()
  const delivered = await deliver(f)
  assert.deepEqual(await ack(f, randomBytes(32).toString('hex')),
    { ok: false, error: 'unauthorized' })
  assert.deepEqual(await ack(f, delivered.tokenHex, { pollingSecretHex: randomBytes(32).toString('hex') }),
    { ok: false, error: 'unauthorized' })
  assert.deepEqual(await ack(f, delivered.tokenHex, { bootstrapProofHex: randomBytes(32).toString('hex') }),
    { ok: false, error: 'unauthorized' })
  assert.deepEqual(await ack(f, delivered.tokenHex),
    { ok: true, alreadyAcknowledged: false })
  assert.equal(f.state, 'acknowledged')
  const repeated = await ack(f, delivered.tokenHex)
  assert.deepEqual(repeated, { ok: true, alreadyAcknowledged: true })
  assert.equal(Object.hasOwn(repeated, 'tokenHex'), false)
  assert.deepEqual(await deliver(f), { ok: false, error: 'unauthorized' })
})

test('expired session and repository errors fail without leaking payload or DB messages', async () => {
  const f = fixture()
  f.expire()
  assert.deepEqual(await deliver(f), { ok: false, error: 'expired' })
  const g = fixture()
  g.repo.deliver = async () => { throw Error('SQL error: raw private data') }
  assert.deepEqual(await deliver(g), { ok: false, error: 'unavailable' })
  assert.deepEqual(await ack(g, randomBytes(32).toString('hex')), { ok: false, error: 'unauthorized' })
})

test('SQL validates encrypted envelope length and locks canonical records in fixed order', () => {
  assert.match(sql, /octet_length\(p_candidate_envelope\) <> 61/)
  assert.match(sql, /get_byte\(p_candidate_envelope, 0\) <> 1/)
  assert.match(sql, /for update of d, c/g)
  assert.match(sql, /for update;/g)
  assert.match(sql, /v_session\.polling_secret_hash is distinct from p_polling_secret_hash/g)
  assert.match(sql, /v_session\.claimed_by_user_id is distinct from v_owner/g)
  assert.match(sql, /v_session\.expires_at <= now\(\)/g)
  assert.match(sql, /interval '3 minutes'/)
  assert.match(sql, /delivery_attempt_count >= 3/)
  assert.match(sql, /select 'delivered'::text, v_session\.encrypted_delivery_payload/)
  assert.match(sql, /s\.state in \('claimed', 'delivered', 'acknowledged'\)/)
})

test('ACK atomically activates verifier, revokes bootstrap, clears ciphertext and blocks replay', () => {
  assert.match(sql, /v_session\.pending_token_hash is distinct from p_presented_token_hash/)
  assert.match(sql, /active_token_hash = p_presented_token_hash/)
  assert.match(sql, /bootstrap_revoked_at = now\(\)/)
  assert.match(sql, /set paired_at = coalesce\(d\.paired_at, now\(\)\)/)
  assert.match(sql, /state = 'acknowledged', acknowledged_at = now\(\), closed_at = now\(\)/)
  assert.match(sql, /pending_token_hash = null,\s+encrypted_delivery_payload = null,\s+encrypted_payload_expires_at = null/)
  assert.match(sql, /return query select 'already_acknowledged'::text/)
  assert.doesNotMatch(sql, /device_token\s*=/)
  assert.doesNotMatch(sql, /return query select [^\n]*(device_token|bootstrap_secret)/)
})

test('private RPC grants are service-role only; HTTP routes stay hard disabled', async () => {
  for (const name of ['pair_v2_staging_delivery_verifier', 'pair_v2_staging_deliver', 'pair_v2_staging_ack']) {
    assert.match(sql, new RegExp('revoke all on function public\\.' + name + '\\('))
    assert.match(sql, new RegExp('grant execute on function public\\.' + name + '\\('))
  }
  assert.doesNotMatch(sql, /grant\s+(?:usage|select|insert|update|delete)\b/i)
  for (const source of [deliverHttp, ackHttp]) {
    assert.match(source, /PAIRING_V2_ENABLED = false as const/)
    assert.doesNotMatch(source, /req\.json\(|createServiceClient|createPairV2DeliveryStore|\.rpc\(/)
    for (const [staging, status] of [[true, 503], [false, 404]]) {
      const mod = load(source, {
        'next/server': { NextResponse: { json: (value, init = {}) => Response.json(value, init) } },
        '@/app/lib/device/pairingRollout': { legacyPairingQuarantined: () => staging },
      })
      const response = await mod.POST()
      assert.equal(response.status, status)
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
  }
  assert.match(storeSource, /import 'server-only'/)
  assert.doesNotMatch(storeSource, /console\.(?:log|warn|info)|receivedTokenHex|bootstrapProofHex|pollingSecretHex/)
})
