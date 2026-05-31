import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_ENV_NAMES = ['INTEGRATION_CREDENTIALS_KEY', 'SPOND_CREDENTIALS_KEY'] as const

type EncryptedPayload = {
  v: 1
  alg: 'aes-256-gcm'
  iv: string
  tag: string
  ciphertext: string
}

function getKey() {
  const keyEnvName = KEY_ENV_NAMES.find((name) => !!process.env[name])
  const raw = keyEnvName ? process.env[keyEnvName] || '' : ''
  if (!raw) throw new Error('Missing INTEGRATION_CREDENTIALS_KEY')

  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(`${keyEnvName || 'INTEGRATION_CREDENTIALS_KEY'} must be a base64-encoded 32-byte key`)
  }
  return key
}

export function encryptJson(value: unknown): EncryptedPayload {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
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

export function decryptJson<T>(payload: unknown): T {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid encrypted payload')
  const row = payload as Partial<EncryptedPayload>
  if (row.v !== 1 || row.alg !== ALGORITHM || !row.iv || !row.tag || !row.ciphertext) {
    throw new Error('Unsupported encrypted payload')
  }

  const key = getKey()
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(row.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(row.tag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(row.ciphertext, 'base64')),
    decipher.final(),
  ])

  return JSON.parse(plaintext.toString('utf8')) as T
}
