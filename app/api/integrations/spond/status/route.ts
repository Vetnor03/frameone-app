import { NextResponse } from 'next/server'
import { integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { getAuthenticatedUserId, getSupabaseAdmin, publicIntegrationStatus, shouldSyncSpond, SPOND_PROVIDER, syncSpondFromStoredConnection } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const statusResult = await supabase
    .from('user_integrations')
    .select('provider,status,external_account_label,last_sync_at,updated_at')
    .eq('user_id', userId)
    .eq('provider', SPOND_PROVIDER)
    .maybeSingle()
  let data = statusResult.data

  if (statusResult.error) return NextResponse.json({ error: statusResult.error.message }, { status: 500 })

  if (data?.status === 'connected' && shouldSyncSpond(data.last_sync_at)) {
    try {
      await syncSpondFromStoredConnection(userId)
      const refreshed = await supabase
        .from('user_integrations')
        .select('provider,status,external_account_label,last_sync_at,updated_at')
        .eq('user_id', userId)
        .eq('provider', SPOND_PROVIDER)
        .maybeSingle()
      if (!refreshed.error) data = refreshed.data
    } catch {
      const refreshed = await supabase
        .from('user_integrations')
        .select('provider,status,external_account_label,last_sync_at,updated_at')
        .eq('user_id', userId)
        .eq('provider', SPOND_PROVIDER)
        .maybeSingle()
      if (!refreshed.error) data = refreshed.data
    }
  }

  return NextResponse.json({
    ...publicIntegrationStatus(data),
    setup_error: integrationCredentialsKeySetupError('Spond'),
  })
}
