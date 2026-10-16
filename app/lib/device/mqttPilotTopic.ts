/** Exact per-device MQTT topic, shared by EMQX and Ably transports. */
export const MQTT_PILOT_TOPIC_PREFIX = 'remind/pilot/revisions/'

export function pilotRevisionTopic(deviceId: string): string | null {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(deviceId)) return null
  return MQTT_PILOT_TOPIC_PREFIX + deviceId
}
