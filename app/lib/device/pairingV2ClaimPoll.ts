import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const CODE_ALPHABET = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/
const DEVICE_ID = /^frm_[A-F0-9]{12}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[0-9a-f]{64}$/i
const CODE_DOMAIN = 'RE:MIND:pair-v2:display-code:v1:'
const ACCOUNT_DOMAIN = 'RE:MIND:pair-v2:claim-account:v1:'
const NETWORK_DOMAIN = 'RE:MIND:pair-v2:claim-network:v1:'

export type VerifiedPollVerifier = { hashHex: string; generation: number }
export type ClaimOutcome = 'claimed' | 'invalid' | 'rate_limited'
export type PollOutcome = 'pending' | 'claimed' | 'expired' | 'unauthorized'
export type PairV2ClaimPollRepository = {
  claim(input: {
    verifiedUserId: string
    codeMacHex: string
    accountMacHex: string
    networkMacHex: string
  }): Promise<ClaimOutcome>
  readPollVerifier(deviceId: string, sessionId: string): Promise<VerifiedPollVerifier | null>
  poll(input: {
    deviceId: string
    sessionId: string
    generation: number
    expectedVerifierHex: string
    pollingSecretHashHex: string
  }): Promise<PollOutcome>
}

function strictHexDigest(value: string): Buffer | null {
  const hex = value.startsWith('\\x') ? value.slice(2) : value
  return SHA256.test(hex) ? Buffer.from(hex, 'hex') : null
}

function validKey(value: Buffer): boolean {
  return Buffer.isBuffer(value) && value.length >= 32
}

function mac(key: Buffer, domain: string, value: string): string {
  return createHmac('sha256', key).update(domain + value, 'utf8').digest('hex')
}

/**
 * Only a future server endpoint with a verified Supabase JWT may supply the
 * user ID. The networkSource must come from a TRUSTED ingress, not arbitrary
 * client-controlled x-forwarded-for. The endpoint is deliberately disabled.
 */
export async function claimPairingV2(input: {
  verifiedUserId: string
  pairingCode: string
  networkSource: string
  codeHmacKey: Buffer
  throttleHmacKey: Buffer
  repository: PairV2ClaimPollRepository
}): Promise<{ ok: true } | { ok: false; error: 'invalid' | 'rate_limited' | 'unavailable' }> {
  const { verifiedUserId, pairingCode, networkSource, codeHmacKey, throttleHmacKey, repository } = input
  if (!UUID.test(verifiedUserId) || typeof pairingCode !== 'string' ||
      !CODE_ALPHABET.test(pairingCode.trim().toUpperCase())) {
    return { ok: false, error: 'invalid' }
  }
  if (!validKey(codeHmacKey) || !validKey(throttleHmacKey) ||
      typeof networkSource !== 'string' || networkSource.length < 1 ||
      networkSource.length > 128) {
    return { ok: false, error: 'unavailable' }
  }

  try {
    const outcome = await repository.claim({
      verifiedUserId: verifiedUserId.toLowerCase(),
      codeMacHex: mac(codeHmacKey, CODE_DOMAIN, pairingCode.trim().toUpperCase()),
      accountMacHex: mac(throttleHmacKey, ACCOUNT_DOMAIN, verifiedUserId.toLowerCase()),
      networkMacHex: mac(throttleHmacKey, NETWORK_DOMAIN, networkSource),
    })
    if (outcome === 'claimed') return { ok: true }
    if (outcome === 'rate_limited') return { ok: false, error: 'rate_limited' }
    return { ok: false, error: 'invalid' }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

/**
 * Frame polling requires BOTH its supervised bootstrap secret and its
 * independent session-only 256-bit polling secret. No token is returned here.
 */
export async function pollPairingV2(input: {
  deviceId: string
  sessionId: string
  bootstrapProofHex: string
  pollingSecretHex: string
  repository: PairV2ClaimPollRepository
}): Promise<{ ok: true; state: 'pending' | 'claimed' | 'expired' } |
  { ok: false; error: 'unauthorized' | 'unavailable' }> {
  const { deviceId, sessionId, bootstrapProofHex, pollingSecretHex, repository } = input
  if (!DEVICE_ID.test(deviceId) || !UUID.test(sessionId) ||
      !SHA256.test(bootstrapProofHex) || !SHA256.test(pollingSecretHex)) {
    return { ok: false, error: 'unauthorized' }
  }

  try {
    const verifier = await repository.readPollVerifier(deviceId, sessionId)
    const expected = verifier && strictHexDigest(verifier.hashHex)
    if (!expected || !Number.isSafeInteger(verifier?.generation) ||
        (verifier?.generation ?? 0) < 1) {
      return { ok: false, error: 'unauthorized' }
    }
    const actual = createHash('sha256').update(Buffer.from(bootstrapProofHex, 'hex')).digest()
    if (!timingSafeEqual(actual, expected)) {
      return { ok: false, error: 'unauthorized' }
    }
    const result = await repository.poll({
      deviceId,
      sessionId,
      generation: verifier.generation,
      expectedVerifierHex: expected.toString('hex'),
      pollingSecretHashHex: createHash('sha256')
        .update(Buffer.from(pollingSecretHex, 'hex'))
        .digest('hex'),
    })
    if (result === 'pending' || result === 'claimed' || result === 'expired') {
      return { ok: true, state: result }
    }
    return { ok: false, error: 'unauthorized' }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}
