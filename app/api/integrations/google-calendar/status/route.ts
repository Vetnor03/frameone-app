import { NextResponse } from 'next/server'
import { getAuthenticatedUserId, getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { googleCalendarSetupError } from '@/app/lib/integrations/google-calendar/client'
import { GOOGLE_CALENDAR_PROVIDER, publicGoogleCalendarStatus } from '@/app/lib/integrations/google-calendar/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await getSupabaseAdmin().from('user_integrations')
    .select('provider,status,external_account_label,last_sync_at')
    .eq('user_id', userId).eq('provider', GOOGLE_CALENDAR_PROVIDER).maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not read Google Calendar connection' }, { status: 500 })
  return NextResponse.json({
    ...publicGoogleCalendarStatus(data),
    setup_error: googleCalendarSetupError() || integrationCredentialsKeySetupError('Google Calendar'),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
