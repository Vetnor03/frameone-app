/**
 * One-device MQTT pilot credentials. This is deliberately NOT production
 * provisioning: one secret is allowed to exactly one test frame.
 * No browser/user token or device other than the allowlisted physical frame
 * can retrieve these secrets through the paired-device authentication endpoint.
 */
export type PilotCredentialEnv = {
  enabled?: string
  pilotDeviceId?: string
  framePassword?: string
}

export function pilotCredentialPayload(deviceId: string, env: PilotCredentialEnv = {
  enabled: process.env.MQTT_PILOT_ENABLED,
  pilotDeviceId: process.env.MQTT_PILOT_DEVICE_ID,
  framePassword: process.env.MQTT_PILOT_FRAME_PASSWORD,
}): { username: string; password: string } | null {
  if (env.enabled !== 'true' || !env.pilotDeviceId ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(env.pilotDeviceId) ||
    deviceId !== env.pilotDeviceId ||
    !env.framePassword || env.framePassword.length < 24 ||
    env.framePassword.length > 256) return null

  return { username: deviceId, password: env.framePassword }
}
