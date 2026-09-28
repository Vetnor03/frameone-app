import 'server-only'
import {
  createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual,
} from 'node:crypto'

const DEVICE_ID = /^frm_[A-F0-9]{12}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_256 = /^[a-f0-9]{64}$/i
const ENVELOPE_VERSION = 1
const ENVELOPE_BYTES = 1 + 12 + 32 + 16
const AAD_DOMAIN = 'RE:MIND:pair-v2:delivery:v1:'

export type DeliveryVerifier = {
  hashHex: string
  generation: number
}

export type DeliveryOutcome =
  | { kind: 'delivered'; envelopeHex: string; tokenHashHex: string }
  | { kind: 'expired' | 'retry_exhausted' | 'unauthorized' }

export type PairV2DeliveryRepository = {
  readDeliveryVerifier(deviceId: string, sessionId: string): Promise<DeliveryVerifier | null>
  deliver(input: {
    deviceId: string
    sessionId: string
    generation: number
    expectedVerifierHex: string
    pollingSecretHashHex: string
    candidateTokenHashHex: string
    candidateEnvelopeHex: string
  }): Promise<DeliveryOutcome>
  acknowledge(input: {
    deviceId: string
    sessionId: string
    generation: number
    expectedVerifierHex: string
    pollingSecretHashHex: string
    receivedTokenHashHex: string
  }): Promise<'acknowledged' | 'already_acknowledged' | 'unauthorized'>
}

type FrameProof = {
  deviceId: string
  sessionId: string
  bootstrapProofHex: string
  pollingSecretHex: string
  repository: PairV2DeliveryRepository
}

type VerifiedProof = {
  generation: number
  expectedVerifierHex: string
  pollingSecretHashHex: string
}

const failure = { ok: false, error: 'unauthorized' } as const
const unavailable = { ok: false, error: 'unavailable' } as const

function sha256(hexBytes: string): string {
  return createHash('sha256').update(Buffer.from(hexBytes, 'hex')).digest('hex')
}

function digestFromDb(value: string): Buffer | null {
  if (typeof value !== 'string') return null
  const raw = value.startsWith('\\x') ? value.slice(2) : value
  return HEX_256.test(raw) ? Buffer.from(raw, 'hex') : null
}

function validFrameProof(input: FrameProof): boolean {
  return DEVICE_ID.test(input.deviceId) &&
    UUID.test(input.sessionId) &&
    HEX_256.test(input.bootstrapProofHex) &&
    HEX_256.test(input.pollingSecretHex)
}

function validKey(key: Buffer): boolean {
  return Buffer.isBuffer(key) && key.length === 32
}

function associatedData(deviceId: string, sessionId: string, generation: number): Buffer {
  return Buffer.from(AAD_DOMAIN + deviceId + ':' + sessionId.toLowerCase() + ':' + generation, 'utf8')
}

function sealToken(token: Buffer, key: Buffer, aad: Buffer): Buffer {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(aad)
  const ciphertext = Buffer.concat([cipher.update(token), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([Buffer.from([ENVELOPE_VERSION]), nonce, ciphertext, tag])
}

function unsealToken(envelope: Buffer, key: Buffer, aad: Buffer): Buffer {
  if (envelope.length !== ENVELOPE_BYTES || envelope[0] !== ENVELOPE_VERSION) {
    throw new Error('invalid envelope')
  }
  const nonce = envelope.subarray(1, 13)
  const ciphertext = envelope.subarray(13, 45)
  const tag = envelope.subarray(45)
  const decipher = createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAAD(aad)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  if (plaintext.length !== 32) throw new Error('invalid token size')
  return plaintext
}

async function proveFrame(input: FrameProof): Promise<VerifiedProof | null> {
  if (!validFrameProof(input)) return null

  const row = await input.repository.readDeliveryVerifier(input.deviceId, input.sessionId)
  const expected = row && digestFromDb(row.hashHex)
  if (!expected || !Number.isSafeInteger(row?.generation) || (row?.generation ?? 0) < 1) {
    return null
  }
  const actual = Buffer.from(sha256(input.bootstrapProofHex), 'hex')
  if (!timingSafeEqual(actual, expected)) return null
  return {
    generation: row!.generation,
    expectedVerifierHex: expected.toString('hex'),
    pollingSecretHashHex: sha256(input.pollingSecretHex),
  }
}

/**
 * Must be reached only through a future authenticated, rate-limited staging
 * physical-frame handler. It is NOT called by current HTTP endpoints.
 * Server-side key is independently generated, never NEXT_PUBLIC or stored
 * in the pairing DB. Ciphertext AAD binds the exact frame/session/generation.
 */
export async function deliverPairingV2(input: FrameProof & {
  deliveryKey: Buffer
}): Promise<
  | { ok: true; tokenHex: string }
  | { ok: false; error: 'unauthorized' | 'expired' | 'retry_exhausted' | 'unavailable' }
> {
  if (!validFrameProof(input)) return failure
  if (!validKey(input.deliveryKey)) return unavailable

  try {
    const proof = await proveFrame(input)
    if (!proof) return failure

    // A new candidate is generated each attempt, but the SQL transaction
    // keeps the first ciphertext on retry; the candidate is never substituted.
    const candidate = randomBytes(32)
    const candidateHashHex = createHash('sha256').update(candidate).digest('hex')
    const envelope = sealToken(
      candidate,
      input.deliveryKey,
      associatedData(input.deviceId, input.sessionId, proof.generation),
    )
    const result = await input.repository.deliver({
      deviceId: input.deviceId,
      sessionId: input.sessionId,
      generation: proof.generation,
      expectedVerifierHex: proof.expectedVerifierHex,
      pollingSecretHashHex: proof.pollingSecretHashHex,
      candidateTokenHashHex: candidateHashHex,
      candidateEnvelopeHex: envelope.toString('hex'),
    })
    if (result.kind === 'expired' || result.kind === 'retry_exhausted') {
      return { ok: false, error: result.kind }
    }
    if (result.kind !== 'delivered') return failure

    if (!/^[0-9a-f]{122}$/i.test(result.envelopeHex) ||
        !HEX_256.test(result.tokenHashHex)) return unavailable

    const payload = unsealToken(
      Buffer.from(result.envelopeHex, 'hex'),
      input.deliveryKey,
      associatedData(input.deviceId, input.sessionId, proof.generation),
    )
    const returnedHash = Buffer.from(result.tokenHashHex, 'hex')
    const computedHash = createHash('sha256').update(payload).digest()
    if (!timingSafeEqual(computedHash, returnedHash)) return unavailable

    // Sent only to a future authenticated physical frame over validated TLS.
    return { ok: true, tokenHex: payload.toString('hex') }
  } catch {
    // AES tag failure, DB issues, or malformed results never echo secrets.
    return unavailable
  }
}

/**
 * The frame persists its token first, then proves possession of that SAME
 * token plus both physical/session proofs. SQL makes activation atomic and
 * scrubs temporary ciphertext; repeated ACK returns status, never a token.
 */
export async function acknowledgePairingV2(input: FrameProof & {
  receivedTokenHex: string
}): Promise<
  | { ok: true; alreadyAcknowledged: boolean }
  | { ok: false; error: 'unauthorized' | 'unavailable' }
> {
  if (!validFrameProof(input) || !HEX_256.test(input.receivedTokenHex)) return failure
  try {
    const proof = await proveFrame(input)
    if (!proof) return failure
    const outcome = await input.repository.acknowledge({
      deviceId: input.deviceId,
      sessionId: input.sessionId,
      generation: proof.generation,
      expectedVerifierHex: proof.expectedVerifierHex,
      pollingSecretHashHex: proof.pollingSecretHashHex,
      receivedTokenHashHex: sha256(input.receivedTokenHex),
    })
    if (outcome === 'acknowledged') return { ok: true, alreadyAcknowledged: false }
    if (outcome === 'already_acknowledged') return { ok: true, alreadyAcknowledged: true }
    return failure
  } catch {
    return unavailable
  }
}
