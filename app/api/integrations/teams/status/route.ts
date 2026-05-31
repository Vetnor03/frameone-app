import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { getSupabaseAdmin, publicTeamsStatus, TEAMS_PROVIDER } from '@/app/lib/integrations/teams/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  return NextResponse.json(publicTeamsStatus(data))
}
