/**
 * Experimental EMQX MQTT-push bridge.
 *
 * Both manual revisions and temporary foreground-presence hints use the same
 * device-scoped topic and authenticated, best-effort publish path. No dedicated
 * topic ACL or extra broker configuration is needed for Smart Instant.
 */
import { mqttEnabledForDevice } from './mqttRollout.ts'

export const MQTT_PILOT_TOPIC_PREFIX = 'remind/pilot/revisions/'

export function pilotRevisionTopic(deviceId: string): string | null {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(deviceId)) return null
  return MQTT_PILOT_TOPIC_PREFIX + deviceId
}

export type PilotPushResult = 'disabled' | 'published' | 'no_subscribers' | 'failed'

export type BrokerConfig = {
  enabled?: string
  pilotDeviceId?: string
  fleetEnabled?: string
  fleetSecret?: string
  fleetProvider?: string
  fleetManagementUrl?: string
  fleetBrokerHost?: string
  fleetBrokerPort?: string
  fleetApiKey?: string
  fleetApiSecret?: string
  publishUrl?: string
  apiKey?: string
  apiSecret?: string
}

function defaultBrokerConfig(): BrokerConfig {
  return {
    enabled: process.env.MQTT_PILOT_ENABLED,
    pilotDeviceId: process.env.MQTT_PILOT_DEVICE_ID,
    fleetEnabled: process.env.MQTT_FLEET_ENABLED,
    fleetSecret: process.env.MQTT_FLEET_DERIVATION_SECRET,
    fleetProvider: process.env.MQTT_FLEET_PROVIDER,
    fleetManagementUrl: process.env.MQTT_FLEET_MANAGEMENT_URL,
    fleetBrokerHost: process.env.MQTT_FLEET_BROKER_HOST,
    fleetBrokerPort: process.env.MQTT_FLEET_BROKER_PORT,
    fleetApiKey: process.env.MQTT_FLEET_API_KEY,
    fleetApiSecret: process.env.MQTT_FLEET_API_SECRET,
    publishUrl: process.env.MQTT_PILOT_EMQX_PUBLISH_URL,
    apiKey: process.env.MQTT_PILOT_EMQX_API_KEY,
    apiSecret: process.env.MQTT_PILOT_EMQX_API_SECRET,
  }
}

async function publishPilotMessage(
  deviceId: string,
  message: string,
  config: BrokerConfig,
  fetchImpl: typeof fetch,
): Promise<PilotPushResult> {
  if (!mqttEnabledForDevice(deviceId, { pilotEnabled: config.enabled, pilotDeviceId: config.pilotDeviceId, fleetEnabled: config.fleetEnabled, fleetSecret: config.fleetSecret, fleetProvider: config.fleetProvider, fleetManagementUrl: config.fleetManagementUrl, fleetBrokerHost: config.fleetBrokerHost, fleetBrokerPort: config.fleetBrokerPort, fleetApiKey: config.fleetApiKey, fleetApiSecret: config.fleetApiSecret })) return 'disabled'
  const topic = pilotRevisionTopic(deviceId)
  const pilot = config.enabled === 'true' && deviceId === config.pilotDeviceId
  // Fleet messages are published through the *same* Dedicated management API
  // that provisions the accounts. Never publish fleet revisions to Serverless.
  const publishUrl = pilot ? config.publishUrl :
    config.fleetManagementUrl?.replace(/\/$/, '') + '/publish'
  const apiKey = pilot ? config.apiKey : config.fleetApiKey
  const apiSecret = pilot ? config.apiSecret : config.fleetApiSecret
  if (!topic || !publishUrl || !apiKey || !apiSecret) return 'failed'

  let endpoint: URL
  try {
    endpoint = new URL(publishUrl)
  } catch {
    return 'failed'
  }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
    endpoint.search || endpoint.hash ||
    !['/publish', '/api/v5/publish'].includes(endpoint.pathname)) return 'failed'

  try {
    const response = await fetchImpl(endpoint.toString(), {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(1800),
      headers: {
        authorization: 'Basic ' + Buffer.from(apiKey + ':' + apiSecret).toString('base64'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        topic,
        qos: 1,
        retain: false,
        payload: message,
        payload_encoding: 'plain',
      }),
    })
    if (response.status === 202) return 'no_subscribers'
    return response.ok ? 'published' : 'failed'
  } catch {
    return 'failed'
  }
}

// Revision messages remain decimal only and always require the frame's
// authoritative HTTPS revision check before display.
export async function publishPilotRevision(
  deviceId: string,
  revision: number,
  config: BrokerConfig = defaultBrokerConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<PilotPushResult> {
  if (!Number.isSafeInteger(revision) || revision <= 0) {
    if (!mqttEnabledForDevice(deviceId, { pilotEnabled: config.enabled, pilotDeviceId: config.pilotDeviceId, fleetEnabled: config.fleetEnabled, fleetSecret: config.fleetSecret, fleetProvider: config.fleetProvider, fleetManagementUrl: config.fleetManagementUrl, fleetBrokerHost: config.fleetBrokerHost, fleetBrokerPort: config.fleetBrokerPort, fleetApiKey: config.fleetApiKey, fleetApiSecret: config.fleetApiSecret })) return 'disabled'
    return 'failed'
  }
  return publishPilotMessage(deviceId, String(revision), config, fetchImpl)
}

// The presence hint is not an update request, and cannot cause a redraw.
// The frame enforces an absolute 120-second ceiling even if a malformed
// or delayed activity hint is received. Repeated app activity extends it.
export async function publishPilotActivity(
  deviceId: string,
  config: BrokerConfig = defaultBrokerConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<PilotPushResult> {
  return publishPilotMessage(deviceId, 'active:120', config, fetchImpl)
}
