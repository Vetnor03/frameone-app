import type { SupabaseClient } from '@supabase/supabase-js'

// Read the operator-owned flag afresh for every authenticated device probe.
// Never convert unavailable/malformed state to false: that could reactivate a frame.
export async function pilotEndedForDevice(client: Pick<SupabaseClient, 'from'>, deviceId: string): Promise<boolean> {
  const { data, error } = await client.from('devices')
    .select('pilot_ended').eq('device_id', deviceId).maybeSingle()
  if (error || typeof data?.pilot_ended !== 'boolean') {
    throw new Error('pilot_state_unavailable')
  }
  return data.pilot_ended
}
