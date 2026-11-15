import type { SupabaseClient } from '@supabase/supabase-js'
import { ablyAutoConfigured, ablyAutoForPairedDevice, type MqttRolloutEnv } from './mqttRollout.ts'

/**
 * Automatic Ably onboarding uses the existing pairing record, not a guessed
 * device ID or a manufacturing-time secret. Both the pairing timestamp and
 * current membership must exist. Missing/failed database reads fail closed.
 *
 * This only runs when the explicit new-frame rollout gate is configured.
 */
export async function isAblyAutoEligibleForDevice(
  deviceId: string,
  env: MqttRolloutEnv = {
    ablyAutoEnabled: process.env.MQTT_ABLY_AUTO_ENABLED,
    ablyAutoPairedSince: process.env.MQTT_ABLY_AUTO_PAIRED_SINCE,
    fleetProvider: process.env.MQTT_FLEET_PROVIDER,
    ablyApiKey: process.env.MQTT_ABLY_API_KEY,
    ablyRootCaPem: process.env.MQTT_ABLY_ROOT_CA_PEM,
  },
  database?: SupabaseClient,
): Promise<boolean> {
  if (!ablyAutoConfigured(env) || !/^[A-Za-z0-9_-]{1,128}$/.test(deviceId)) return false
  try {
    // Avoid opening a service-role connection unless this rollout is enabled.
    const db = database ?? (await import('../supabase/serviceClient')).createServiceClient()
    const { data: device, error: deviceError } = await db
      .from('devices').select('paired_at').eq('device_id', deviceId).maybeSingle()
    if (deviceError || !device || !ablyAutoForPairedDevice(deviceId, device.paired_at, true, env)) return false

    // A stale paired_at must not authorize a removed/unshared frame.
    const { data: members, error: memberError } = await db
      .from('device_members').select('device_id').eq('device_id', deviceId).limit(1)
    return !memberError && ablyAutoForPairedDevice(deviceId, device.paired_at, Boolean(members?.length), env)
  } catch {
    return false
  }
}
