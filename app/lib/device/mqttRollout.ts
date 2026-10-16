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
}
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
}): boolean {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(deviceId)) return false
  if (env.pilotEnabled === 'true' && deviceId === env.pilotDeviceId) return true

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
