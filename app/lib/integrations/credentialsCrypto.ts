import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_ENV = 'INTEGRATION_CREDENTIALS_KEY'
const LEGACY_KEY_ENV = 'SPOND_CREDENTIALS_KEY'

export const MISSING_INTEGRATION_CREDENTIALS_KEY_ERROR = `Missing ${KEY_ENV}`
export const INVALID_INTEGRATION_CREDENTIALS_KEY_ERROR = `${KEY_ENV} must be a base64-encoded 32-byte key`

export function getIntegrationCredentialsKeyStatus() {
  const envName = process.env[KEY_ENV] ? KEY_ENV : LEGACY_KEY_ENV
  const raw = process.env[KEY_ENV] || process.env[LEGACY_KEY_ENV] || ''
  if (!raw) {
    return { configured: false, valid: false, envName: KEY_ENV, error: MISSING_INTEGRATION_CREDENTIALS_KEY_ERROR }
  }

  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    return {
      configured: true,
      valid: false,
      envName,
      error: envName === KEY_ENV ? INVALID_INTEGRATION_CREDENTIALS_KEY_ERROR : `${LEGACY_KEY_ENV} must be a base64-encoded 32-byte key`,
    }
  }

  return { configured: true, valid: true, envName, error: null }
}

export function isIntegrationCredentialsKeyConfigError(error: unknown) {
  if (!(error instanceof Error)) return false
  return error.message === MISSING_INTEGRATION_CREDENTIALS_KEY_ERROR || error.message.includes('must be a base64-encoded 32-byte key')
}

export function integrationCredentialsKeyUserMessage(integrationName = 'Teams') {
  return `${integrationName} needs a server encryption key before it can connect. Add INTEGRATION_CREDENTIALS_KEY in your deployment environment variables and redeploy.`
}

export function integrationCredentialsKeySetupError(integrationName = 'Teams') {
  const status = getIntegrationCredentialsKeyStatus()
  if (status.valid) return null
  return {
    code: 'missing_integration_credentials_key',
    envName: status.envName,
    message: integrationCredentialsKeyUserMessage(integrationName),
  }
}

export type EncryptedPayload = {
  v: 1
  alg: 'aes-256-gcm'
  iv: string
  tag: string
  ciphertext: string
}

function getKey() {
  const status = getIntegrationCredentialsKeyStatus()
  if (!status.valid) throw new Error(status.error || MISSING_INTEGRATION_CREDENTIALS_KEY_ERROR)
  return Buffer.from(process.env[status.envName] || '', 'base64')
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
