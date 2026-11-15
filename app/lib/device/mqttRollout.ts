/**
 * MQTT transport is optional. The existing single-frame trial remains enabled
 * independently; enabling the fleet later is a server-side configuration
 * change and NEVER requires a firmware reflash.
 */
import { isAblyApiKey } from './mqttAbly.ts'

export type MqttRolloutEnv = {
  pilotEnabled?: string
  pilotDeviceId?: string
  fleetEnabled?: string
  fleetSecret?: string
  fleetProvider?: string
  fleetManagementUrl?: string
  fleetBrokerHost?: string
  fleetBrokerPort?: string
  fleetApiKey?: string
  fleetApiSecret?: string
  ablyApiKey?: string
  ablyRootCaPem?: string
  ablyCanaryEnabled?: string
  ablyCanaryDeviceId?: string
  ablyPilotEnabled?: string
  ablyPilotDeviceIds?: string
  ablyAutoEnabled?: string
  ablyAutoPairedSince?: string
}
/**
 * Dormant until deliberately enabled after hardware and pairing-v2 checks.
 * Only frames FIRST paired at/after this UTC cutoff become automatically
 * eligible. Never silently include every old paired frame.
 */
export function ablyAutoConfigured(env: MqttRolloutEnv): boolean {
  const since = env.ablyAutoPairedSince
  if (env.ablyAutoEnabled !== 'true' || env.fleetProvider !== 'ably_jwt_v1' ||
      !isAblyApiKey(env.ablyApiKey) || !env.ablyRootCaPem ||
      env.ablyRootCaPem.length > 4096 ||
      !env.ablyRootCaPem.includes('-----BEGIN CERTIFICATE-----') ||
      !env.ablyRootCaPem.includes('-----END CERTIFICATE-----') ||
      !since || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(since)) return false
  const timestamp = Date.parse(since)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === since
}

export function ablyAutoForPairedDevice(
  deviceId: string,
  pairedAt: unknown,
  hasCurrentMember: boolean,
  env: MqttRolloutEnv,
): boolean {
  if (!ablyAutoConfigured(env) || !/^[A-Za-z0-9_-]{1,128}$/.test(deviceId) ||
      !hasCurrentMember || typeof pairedAt !== 'string') return false
  const pairedTimestamp = Date.parse(pairedAt)
  return Number.isFinite(pairedTimestamp) &&
    pairedTimestamp >= Date.parse(env.ablyAutoPairedSince!)
}

// An explicit five-frame pilot is separate from both the canary and fleet.
// Reject malformed, duplicated and oversized lists rather than broadening scope.
export function ablyPilotForDevice(deviceId: string, env: MqttRolloutEnv): boolean {
  if (env.ablyPilotEnabled !== 'true' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(deviceId) ||
      !isAblyApiKey(env.ablyApiKey) ||
      !env.ablyRootCaPem || env.ablyRootCaPem.length > 4096 ||
      !env.ablyRootCaPem.includes('-----BEGIN CERTIFICATE-----') ||
      !env.ablyRootCaPem.includes('-----END CERTIFICATE-----')) return false
  const ids = (env.ablyPilotDeviceIds ?? '').split(',').map(id => id.trim())
  return ids.length >= 1 && ids.length <= 5 &&
    ids.every(id => /^[A-Za-z0-9_-]{1,128}$/.test(id)) &&
    new Set(ids).size === ids.length && ids.includes(deviceId)
}

export function ablyCanaryForDevice(deviceId: string, env: MqttRolloutEnv): boolean {
  return env.ablyCanaryEnabled === 'true' &&
    env.ablyCanaryDeviceId === deviceId &&
    /^[A-Za-z0-9_-]{1,128}$/.test(deviceId) &&
    isAblyApiKey(env.ablyApiKey) &&
    Boolean(env.ablyRootCaPem && env.ablyRootCaPem.length <= 4096 &&
      env.ablyRootCaPem.includes('-----BEGIN CERTIFICATE-----') &&
      env.ablyRootCaPem.includes('-----END CERTIFICATE-----'))
}

// A single, explicit real-device Ably canary is independent of the global
// fleet switch and preserves the legacy EMQX pilot. This can be turned off
// server-side without reflashing the frame.
export function mqttEnabledForDevice(deviceId: string, env: MqttRolloutEnv = {
  pilotEnabled: process.env.MQTT_PILOT_ENABLED,
  pilotDeviceId: process.env.MQTT_PILOT_DEVICE_ID,
  fleetEnabled: process.env.MQTT_FLEET_ENABLED,
  fleetSecret: process.env.MQTT_FLEET_DERIVATION_SECRET,
  fleetProvider: process.env.MQTT_FLEET_PROVIDER,
  fleetManagementUrl: process.env.MQTT_FLEET_MANAGEMENT_URL,
  fleetBrokerHost: process.env.MQTT_FLEET_BROKER_HOST,
  fleetBrokerPort: process.env.MQTT_FLEET_BROKER_PORT,
  fleetApiKey: process.env.MQTT_FLEET_API_KEY,
  fleetApiSecret: process.env.MQTT_FLEET_API_SECRET,
  ablyApiKey: process.env.MQTT_ABLY_API_KEY,
  ablyRootCaPem: process.env.MQTT_ABLY_ROOT_CA_PEM,
  ablyCanaryEnabled: process.env.MQTT_ABLY_CANARY_ENABLED,
  ablyCanaryDeviceId: process.env.MQTT_ABLY_CANARY_DEVICE_ID,
  ablyPilotEnabled: process.env.MQTT_ABLY_PILOT_ENABLED,
  ablyPilotDeviceIds: process.env.MQTT_ABLY_PILOT_DEVICE_IDS,
}): boolean {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(deviceId)) return false
  if (env.pilotEnabled === 'true' && deviceId === env.pilotDeviceId) return true
  if (ablyCanaryForDevice(deviceId, env)) return true
  if (ablyPilotForDevice(deviceId, env)) return true

  // Fleet enablement is independent of the original single-frame experiment.
  // All fleet transport and broker-management inputs must be present before
  // *any* fleet MQTT message is sent or credentials are requested.
  if (env.fleetEnabled !== 'true') return false
  if (env.fleetProvider === 'ably_jwt_v1') {
    const ca = env.ablyRootCaPem
    return isAblyApiKey(env.ablyApiKey) && Boolean(ca && ca.length <= 4096 &&
      ca.includes('-----BEGIN CERTIFICATE-----') &&
      ca.includes('-----END CERTIFICATE-----'))
  }
  if ((env.fleetSecret?.length ?? 0) < 43 ||
      env.fleetProvider !== 'emqx_dedicated_v5' ||
      !env.fleetApiKey || !env.fleetApiSecret ||
      !env.fleetBrokerHost || !/^[a-z0-9.-]{1,253}$/i.test(env.fleetBrokerHost) ||
      !env.fleetBrokerPort || !/^\d{1,5}$/.test(env.fleetBrokerPort) ||
      Number(env.fleetBrokerPort) < 1 || Number(env.fleetBrokerPort) > 65535) return false
  try {
    const management = new URL(env.fleetManagementUrl ?? '')
    return management.protocol === 'https:' &&
      !management.username && !management.password &&
      !management.search && !management.hash &&
      (management.pathname === '/api/v5' || management.pathname === '/api/v5/')
  } catch {
    return false
  }
}
