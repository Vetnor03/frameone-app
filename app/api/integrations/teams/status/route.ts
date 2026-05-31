import { NextResponse } from 'next/server'
import { integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { getAuthenticatedUserId, getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { publicTeamsIntegrationStatus, TEAMS_PROVIDER } from '@/app/lib/integrations/teams/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('user_integrations')
    .select('provider,status,external_account_label,last_sync_at,updated_at')
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    ...publicTeamsIntegrationStatus(data),
    setup_error: integrationCredentialsKeySetupError('Teams'),
  })
}
