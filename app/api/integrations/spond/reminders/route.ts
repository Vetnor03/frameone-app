import { NextResponse } from 'next/server'
import { getAuthenticatedUserId, getSupabaseAdmin, SPOND_PROVIDER, syncSpondFromStoredConnection } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const sync = url.searchParams.get('sync') !== 'false'
  if (sync) {
    try {
      await syncSpondFromStoredConnection(userId)
    } catch {
      // Keep this endpoint useful with cached items when Spond is temporarily unavailable.
    }
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('integration_items')
    .select('id,provider,external_id,title,body,starts_at,due_at,priority,updated_at')
    .eq('user_id', userId)
    .eq('provider', SPOND_PROVIDER)
    .order('priority', { ascending: true })
    .order('starts_at', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ provider: SPOND_PROVIDER, items: data || [] })
}
