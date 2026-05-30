import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

function keyMaterial() {
  const explicit = process.env.PROVIDER_ENCRYPTION_KEY || process.env.SPOND_CREDENTIAL_ENCRYPTION_KEY
  if (explicit) return explicit

  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (fallback) return fallback

  throw new Error('Missing provider encryption key')
}

function encryptionKey() {
  const material = keyMaterial().trim()
  if (/^[a-f0-9]{64}$/i.test(material)) return Buffer.from(material, 'hex')

  try {
    const decoded = Buffer.from(material, 'base64')
    if (decoded.length === 32) return decoded
  } catch {
    // Fall through to deterministic derivation.
  }

  return crypto.createHash('sha256').update(material).digest()
}

export function encryptJson(value: unknown) {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    v: 1,
    alg: ALGORITHM,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

export function decryptJson<T>(encrypted: unknown): T {
  if (!encrypted || typeof encrypted !== 'object') throw new Error('Missing encrypted payload')
  const payload = encrypted as Record<string, unknown>
  if (payload.alg !== ALGORITHM) throw new Error('Unsupported encrypted payload algorithm')

  const iv = Buffer.from(String(payload.iv ?? ''), 'base64')
  const tag = Buffer.from(String(payload.tag ?? ''), 'base64')
  const ciphertext = Buffer.from(String(payload.ciphertext ?? ''), 'base64')

  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(plaintext.toString('utf8')) as T
}
