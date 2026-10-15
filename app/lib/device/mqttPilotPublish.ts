/**
 * Experimental EMQX MQTT-push bridge.
 *
 * Requires a deliberately configured TLS broker and per-device subscriber ACL.
 * The API credentials only authorize server-side publishing, never frame access.
 * Disabled by default; missing configuration means no external calls.
 */
export const MQTT_PILOT_TOPIC_PREFIX = 'remind/pilot/revisions/'

export function pilotRevisionTopic(deviceId: string): string | null {
  // Device identifiers never enter a topic as wildcards, level separators or URL-like data.
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(deviceId)) return null
  return MQTT_PILOT_TOPIC_PREFIX + deviceId
}

export type PilotPushResult = 'disabled' | 'published' | 'no_subscribers' | 'failed'

type BrokerConfig = {
  enabled?: string
  publishUrl?: string
  apiKey?: string
  apiSecret?: string
}

export async function publishPilotRevision(
  deviceId: string,
  revision: number,
  config: BrokerConfig = {
    enabled: process.env.MQTT_PILOT_ENABLED,
    publishUrl: process.env.MQTT_PILOT_EMQX_PUBLISH_URL,
    apiKey: process.env.MQTT_PILOT_EMQX_API_KEY,
    apiSecret: process.env.MQTT_PILOT_EMQX_API_SECRET,
  },
  fetchImpl: typeof fetch = fetch,
): Promise<PilotPushResult> {
  if (config.enabled !== 'true') return 'disabled'
  const topic = pilotRevisionTopic(deviceId)
  if (!topic || !Number.isSafeInteger(revision) || revision <= 0) return 'failed'
  if (!config.publishUrl || !config.apiKey || !config.apiSecret) return 'failed'

  let endpoint: URL
  try {
    endpoint = new URL(config.publishUrl)
  } catch {
    return 'failed'
  }
  // Avoid leaking management credentials to redirected or insecure endpoints.
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
    endpoint.search || endpoint.hash ||
    !['/publish', '/api/v5/publish'].includes(endpoint.pathname)) return 'failed'

  try {
    const response = await fetchImpl(endpoint.toString(), {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(1800),
      headers: {
        authorization: 'Basic ' + Buffer.from(config.apiKey + ':' + config.apiSecret).toString('base64'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        topic,
        qos: 1,
        retain: false,
        payload: String(revision),
        payload_encoding: 'plain',
      }),
    })
    if (response.status === 202) return 'no_subscribers'
    return response.ok ? 'published' : 'failed'
  } catch {
    return 'failed'
  }
}
