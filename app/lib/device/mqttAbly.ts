import { createHmac } from 'node:crypto'
import { pilotRevisionTopic } from './mqttPilotTopic.ts'

/**
 * Ably MQTT adapter: JWT is the MQTT username, empty password.
 * The JWT authorizes subscribe on precisely one device channel.
 * The signing API key never leaves the backend.
 */
export const ABLY_MQTT_HOST = 'main.mqtt.ably.net'
export const ABLY_MQTT_PORT = 8883
export const ABLY_REST_PUBLISH_ORIGIN = 'https://main.realtime.ably.net'
export const ABLY_TOKEN_TTL_SEC = 3600

export function isAblyApiKey(value: string | undefined): boolean {
  if (!value || value.length > 512) return false
  const match = /^([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+):([A-Za-z0-9_-]{16,})$/.exec(value)
  return Boolean(match)
}

export function makeAblyFrameCredentials(
  deviceId: string,
  apiKey: string | undefined,
  issuedAtSeconds = Math.floor(Date.now() / 1000),
): { username: string; password: ''; mqtt_auth: 'ably_jwt_v1'; token_ttl_sec: number } | null {
  const channel = pilotRevisionTopic(deviceId)
  if (!channel || !isAblyApiKey(apiKey) || !Number.isSafeInteger(issuedAtSeconds) || issuedAtSeconds <= 0) return null
  const separator = apiKey!.indexOf(':')
  const keyName = apiKey!.slice(0, separator)
  const keySecret = apiKey!.slice(separator + 1)
  const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = base64url({ typ: 'JWT', alg: 'HS256', kid: keyName })
  const payload = base64url({
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + ABLY_TOKEN_TTL_SEC,
    'x-ably-clientId': deviceId,
    'x-ably-capability': JSON.stringify({ [channel]: ['subscribe'] }),
  })
  const signingInput = header + '.' + payload
  const signature = createHmac('sha256', keySecret).update(signingInput).digest('base64url')
  return {
    username: signingInput + '.' + signature,
    password: '',
    mqtt_auth: 'ably_jwt_v1',
    token_ttl_sec: ABLY_TOKEN_TTL_SEC,
  }
}

export async function publishAblyFrameHint(
  deviceId: string,
  message: string,
  apiKey: string | undefined,
  request: typeof fetch = fetch,
): Promise<'published' | 'failed'> {
  const channel = pilotRevisionTopic(deviceId)
  if (!channel || !isAblyApiKey(apiKey)) return 'failed'
  try {
    const response = await request(
      ABLY_REST_PUBLISH_ORIGIN + '/channels/' + encodeURIComponent(channel) + '/messages',
      {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(1800),
        headers: {
          authorization: 'Basic ' + Buffer.from(apiKey!).toString('base64'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'mqtt-hint', data: message }),
      },
    )
    return response.ok ? 'published' : 'failed'
  } catch {
    return 'failed'
  }
}
