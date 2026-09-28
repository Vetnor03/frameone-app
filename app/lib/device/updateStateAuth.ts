import { createHash } from 'node:crypto'
import { legacyPairingQuarantined } from '@/app/lib/device/pairingRollout'
import { createServiceClient } from '@/app/lib/supabase/serviceClient'

export { createServiceClient }

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
  // We only need the verified user identity for membership authorization.
  // getClaims(token) verifies the Supabase Auth JWT and can use the cached JWKS
  // path, avoiding getUser()'s mandatory Auth-server round trip on every Update.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token)
  const userId = typeof claimsData?.claims?.sub === 'string'
    ? claimsData.claims.sub.trim()
    : ''
  if (claimsError || !userId) return { error: 'invalid_auth_token' as const, status: 401 as const }

  const { data: member, error: memberError } = await supabase
    .from('device_members')
    .select('device_id')
    .eq('device_id', deviceId)
    .eq('user_id', userId)
    .maybeSingle()

  if (memberError) return { error: 'internal_error' as const, status: 500 as const }
  if (!member) return { error: 'forbidden' as const, status: 403 as const }
  return { supabase, userId }
}

export async function authenticatePhysicalDevice(req: Request, deviceId: string) {
  const token = bearerToken(req)
  if (!token) return { error: 'missing_auth_token' as const, status: 401 as const }

  const supabase = createServiceClient()

  if (legacyPairingQuarantined()) {
    // The database checks whether this device has ANY v2 credential row.
    // Unactivated/revoked v2 devices are denied, never downgraded to v1.
    // Hash the decoded 32 token bytes, matching delivery/ACK exactly.
    const validV2Token = /^[a-f0-9]{64}$/i.test(token)
    const candidateHash = validV2Token
      ? createHash('sha256').update(Buffer.from(token, 'hex')).digest('hex')
      : '0'.repeat(64)
    const { data: mode, error: modeError } = await supabase.rpc(
      'pair_v2_staging_device_auth_mode',
      { p_device_id: deviceId, p_candidate_token_hash: '\\x' + candidateHash },
    )
    if (modeError) return { error: 'internal_error' as const, status: 500 as const }
    if (mode === 'v2_valid' && validV2Token) return { supabase }
    if (mode !== 'legacy') return { error: 'unauthorized' as const, status: 401 as const }
  }

  // Legacy-only fallback when no v2 credential record exists. Preserve
  // current production firmware and staging's existing virtual frame flow.
  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('device_id, device_token')
    .eq('device_id', deviceId)
    .maybeSingle()

  if (deviceError) return { error: 'internal_error' as const, status: 500 as const }
  if (!device || device.device_token !== token) return { error: 'unauthorized' as const, status: 401 as const }
  return { supabase }
}
