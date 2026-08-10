import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createServiceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export function bearerToken(req: Request): string {
  const match = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

export function deviceIdFrom(value: unknown): string {
  if (typeof value !== 'string') return ''
  const deviceId = value.trim()
  return deviceId.length > 0 && deviceId.length <= 128 && !/[\u0000-\u001f\u007f]/.test(deviceId) ? deviceId : ''
}

export async function authenticateUserForDevice(req: Request, deviceId: string) {
  const token = bearerToken(req)
  if (!token) return { error: 'missing_auth_token' as const, status: 401 as const }

  const supabase = createServiceClient()
  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user) return { error: 'invalid_auth_token' as const, status: 401 as const }

  const { data: member, error: memberError } = await supabase
    .from('device_members')
    .select('device_id')
    .eq('device_id', deviceId)
    .eq('user_id', authData.user.id)
    .maybeSingle()

  if (memberError) return { error: 'internal_error' as const, status: 500 as const }
  if (!member) return { error: 'forbidden' as const, status: 403 as const }
  return { supabase, userId: authData.user.id }
}

export async function authenticatePhysicalDevice(req: Request, deviceId: string) {
  const token = bearerToken(req)
  if (!token) return { error: 'missing_auth_token' as const, status: 401 as const }

  const supabase = createServiceClient()
  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('device_id, device_token')
    .eq('device_id', deviceId)
    .maybeSingle()

  if (deviceError) return { error: 'internal_error' as const, status: 500 as const }
  if (!device || device.device_token !== token) return { error: 'unauthorized' as const, status: 401 as const }
  return { supabase }
}
