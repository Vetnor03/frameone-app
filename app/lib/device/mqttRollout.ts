/**
 * MQTT transport is optional. The existing single-frame trial remains enabled
 * independently; enabling the fleet later is a server-side configuration
 * change and NEVER requires a firmware reflash.
 */
export type MqttRolloutEnv = {
  pilotEnabled?: string
  pilotDeviceId?: string
  fleetEnabled?: string
  fleetSecret?: string
}
export function mqttEnabledForDevice(deviceId: string, env: MqttRolloutEnv = {
  pilotEnabled: process.env.MQTT_PILOT_ENABLED,
  pilotDeviceId: process.env.MQTT_PILOT_DEVICE_ID,
  fleetEnabled: process.env.MQTT_FLEET_ENABLED,
  fleetSecret: process.env.MQTT_FLEET_DERIVATION_SECRET,
}): boolean {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(deviceId)) return false
  if (env.pilotEnabled !== 'true') return false
  return deviceId === env.pilotDeviceId ||
    (env.fleetEnabled === 'true' && (env.fleetSecret?.length ?? 0) >= 43)
}
