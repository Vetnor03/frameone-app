import { NextResponse } from 'next/server'
import { getAuthenticatedUserId, getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { googleTasksSetupError } from '@/app/lib/integrations/google-tasks/client'
import { GOOGLE_TASKS_PROVIDER } from '@/app/lib/integrations/google-tasks/server'

export const runtime = 'nodejs'
export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await getSupabaseAdmin().from('user_integrations')
    .select('status,external_account_label,last_sync_at')
    .eq('user_id', userId).eq('provider', GOOGLE_TASKS_PROVIDER).maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not read Google Tasks connection' }, { status: 500 })
  return NextResponse.json({
    provider: GOOGLE_TASKS_PROVIDER,
    connected: data?.status === 'connected',
    status: data?.status || 'disconnected',
    account: data?.external_account_label || null,
    last_sync_at: data?.last_sync_at || null,
    setup_error: googleTasksSetupError() || integrationCredentialsKeySetupError('Google Tasks'),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
