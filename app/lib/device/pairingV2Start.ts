import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// Server-only, currently unreachable from HTTP. The bootstrap secret is a
// supervised physical/factory-installed 256-bit secret, NOT a public device ID.
// The short display code is never an authentication credential for the frame.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const DOMAIN = 'RE:MIND:pair-v2:display-code:v1:'
const MAX_CODE_ATTEMPTS = 8

export type BootstrapVerifier = {
  hashHex: string
  generation: number
}

export type OpenSessionInput = {
  deviceId: string
  generation: number
  expectedVerifierHex: string
  displayCodeMacHex: string
  pollingSecretHashHex: string
}

export type OpenSessionOutcome =
  | { kind: 'created'; sessionId: string }
  | { kind: 'collision' | 'already_active' | 'ineligible' }

export type PairV2StartRepository = {
  // Only a server-side, service-role-only RPC may return this verifier.
  // It MUST NOT expose raw bootstrap secrets, ownership, or other user data.
  readEligibleVerifier(deviceId: string): Promise<BootstrapVerifier | null>
  // MUST recheck the verifier, generation and device eligibility under row
  // locks in the same transaction that inserts a new session.
  openSession(input: OpenSessionInput): Promise<OpenSessionOutcome>
}

export type StartResult =
  | { ok: false; error: 'unauthorized' | 'already_active' | 'unavailable' }
  | {
      ok: true
      sessionId: string
      pairingCode: string
      pollingSecret: string
      expiresInSeconds: 600
    }

function strictSha256Hash(value: string): Buffer | null {
  const raw = value.replace(/^\\x/, '')
  return /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : null
}

export function validDeviceId(value: string): boolean {
  return /^frm_[A-F0-9]{12}$/.test(value)
}

function makeDisplayCode(): string {
  const bytes = randomBytes(4)
  return Array.from(bytes, (value) => ALPHABET[value & 31]).join('')
}

/**
 * Prepare one pairing start. Unavailable to HTTP while the staging v2 gate is
 * disabled. The caller will later extract the bootstrap proof from an
 * Authorization header, enforce per-device and source rate limits, and use
 * verified TLS. NEVER include the proof in a URL, JSON log or browser bundle.
 */
export async function startPairingV2(input: {
  deviceId: string
  bootstrapProofHex: string
  displayCodeHmacKey: Buffer
  repository: PairV2StartRepository
}): Promise<StartResult> {
  const { deviceId, bootstrapProofHex, displayCodeHmacKey, repository } = input
  // Uniform response for unknown IDs, incorrect proof and invalid format.
  if (!validDeviceId(deviceId) || !/^[a-f0-9]{64}$/i.test(bootstrapProofHex)) {
    return { ok: false, error: 'unauthorized' }
  }
  if (!Buffer.isBuffer(displayCodeHmacKey) || displayCodeHmacKey.length < 32) {
    return { ok: false, error: 'unavailable' }
  }

  try {
    const verifier = await repository.readEligibleVerifier(deviceId)
    const expected = verifier && strictSha256Hash(verifier.hashHex)
    if (!expected || !Number.isSafeInteger(verifier?.generation) ||
        (verifier?.generation ?? 0) < 1) {
      return { ok: false, error: 'unauthorized' }
    }

    const actual = createHash('sha256').update(Buffer.from(bootstrapProofHex, 'hex')).digest()
    if (!timingSafeEqual(actual, expected)) {
      return { ok: false, error: 'unauthorized' }
    }

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const pairingCode = makeDisplayCode()
      const displayCodeMacHex = createHmac('sha256', displayCodeHmacKey)
        .update(DOMAIN + pairingCode, 'utf8')
        .digest('hex')
      const pollingSecret = randomBytes(32).toString('hex')
      const pollingSecretHashHex = createHash('sha256')
        .update(Buffer.from(pollingSecret, 'hex'))
        .digest('hex')

      const outcome = await repository.openSession({
        deviceId,
        generation: verifier.generation,
        expectedVerifierHex: expected.toString('hex'),
        displayCodeMacHex,
        pollingSecretHashHex,
      })

      if (outcome.kind === 'created') {
        if (!/^[0-9a-f-]{36}$/i.test(outcome.sessionId)) {
          return { ok: false, error: 'unavailable' }
        }
        // Only the authenticated physical frame may receive these values.
        return {
          ok: true, sessionId: outcome.sessionId, pairingCode,
          pollingSecret, expiresInSeconds: 600,
        }
      }
      if (outcome.kind === 'already_active') {
        return { ok: false, error: 'already_active' }
      }
      if (outcome.kind === 'ineligible') {
        return { ok: false, error: 'unauthorized' }
      }
      // A coincident display-code MAC is retried with all-new material.
    }
    return { ok: false, error: 'unavailable' }
  } catch {
    // Never include the verifier, raw proof or internal SQL error in a result.
    return { ok: false, error: 'unavailable' }
  }
}
