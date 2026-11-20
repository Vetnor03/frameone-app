import { NextResponse } from 'next/server'
import { getAuthenticatedUserId, getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { todoistSetupError } from '@/app/lib/integrations/todoist/client'
import { TODOIST_PROVIDER } from '@/app/lib/integrations/todoist/server'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await getSupabaseAdmin().from('user_integrations')
    .select('status,external_account_label,last_sync_at')
    .eq('user_id', userId).eq('provider', TODOIST_PROVIDER).maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not read Todoist connection' }, { status: 500 })
  return NextResponse.json({
    provider: TODOIST_PROVIDER,
    connected: data?.status === 'connected',
    status: data?.status || 'disconnected',
    account: data?.external_account_label || null,
    last_sync_at: data?.last_sync_at || null,
    setup_error: todoistSetupError() || integrationCredentialsKeySetupError('Todoist'),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
