import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { syncWasteFromStoredConnection, WASTE_PROVIDER, WASTE_STALE_MS } from '@/app/lib/integrations/waste/server'
export const runtime = 'nodejs'
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const staleBefore = new Date(Date.now() - WASTE_STALE_MS).toISOString()
  const { data, error } = await getSupabaseAdmin().from('user_integrations').select('user_id').eq('provider', WASTE_PROVIDER).eq('status', 'connected').or(`last_sync_at.is.null,last_sync_at.lt.${staleBefore}`).limit(250)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const users = Array.from(new Set((data || []).map((row) => String(row.user_id))))
  await Promise.allSettled(users.map((userId) => syncWasteFromStoredConnection(userId)))
  return NextResponse.json({ checked: users.length })
}
