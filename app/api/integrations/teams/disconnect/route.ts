import { NextResponse } from 'next/server'
import { getAuthenticatedUserId, getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { TEAMS_PROVIDER } from '@/app/lib/integrations/teams/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { error: itemsError } = await supabase
    .from('integration_items')
    .delete()
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

  const { error } = await supabase
    .from('user_integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ provider: TEAMS_PROVIDER, connected: false, status: 'disconnected' })
}
