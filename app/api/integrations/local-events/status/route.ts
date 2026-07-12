import { NextResponse } from 'next/server'
import { EDGE_OF_NORWAY_PROVIDER } from '@/app/lib/integrations/local-events/edge-of-norway-shadow'
import { normalizeLocalEventAreaPreference } from '@/app/lib/integrations/local-events/places'
import { requireLocalEventsFrameMember } from '@/app/lib/integrations/local-events/server'
import { getAuthenticatedUserId, getSupabaseAdmin } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const deviceId = String(url.searchParams.get('deviceId') || url.searchParams.get('device_id') || '').trim()
  if (!deviceId) return NextResponse.json({ connected: false, account: null, areaPreference: null, last_sync_at: null, updated_at: null, canManage: false })
  try {
    const member = await requireLocalEventsFrameMember(userId, deviceId, false)
    const { data, error } = await getSupabaseAdmin().from('user_integrations').select('status,external_account_label,encrypted_credentials,last_sync_at,updated_at').eq('device_id', deviceId).eq('provider', EDGE_OF_NORWAY_PROVIDER).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const areaPreference = normalizeLocalEventAreaPreference((data?.encrypted_credentials as any)?.areaPreference)
    return NextResponse.json({ connected: data?.status === 'connected', account: data?.external_account_label || null, areaPreference, last_sync_at: data?.last_sync_at || null, updated_at: data?.updated_at || null, canManage: member.canManage })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Forbidden' }, { status: 403 })
  }
}
