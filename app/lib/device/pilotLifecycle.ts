// Server-only operator control. Empty by default; never accepts wildcards.
// Exact IDs prevent accidentally ending the pilot for the entire fleet.
export function pilotEndedForDevice(deviceId: string, configuredIds = process.env.PILOT_ENDED_DEVICE_IDS ?? ''): boolean {
  return configuredIds.split(',').some(id => id.trim() === deviceId && deviceId.length > 0)
}
