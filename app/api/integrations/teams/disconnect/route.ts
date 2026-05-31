import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { getSupabaseAdmin, TEAMS_PROVIDER } from '@/app/lib/integrations/teams/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { error: itemError } = await supabase
    .from('integration_items')
    .delete()
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })

  const { error } = await supabase
    .from('user_integrations')
    .upsert({
      user_id: userId,
      provider: TEAMS_PROVIDER,
      status: 'disconnected',
      encrypted_credentials: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ provider: TEAMS_PROVIDER, connected: false, status: 'disconnected' })
}
