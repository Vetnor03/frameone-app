import { NextResponse } from 'next/server'
import { getAuthenticatedUserId, getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { googleCalendarSetupError } from '@/app/lib/integrations/google-calendar/client'
import { GOOGLE_TASKS_PROVIDER, googleTasksAllowedForUser, googleTasksStatus } from '@/app/lib/integrations/google-tasks/server'

export const runtime = 'nodejs'
export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({error:'Unauthorized'},{status:401})
  const eligible = googleTasksAllowedForUser(userId)
  if (!eligible) return NextResponse.json({...googleTasksStatus(null),eligible:false},{headers:{'Cache-Control':'no-store'}})
  const {data,error} = await getSupabaseAdmin().from('user_integrations')
    .select('status,external_account_label,last_sync_at')
    .eq('user_id',userId).eq('provider',GOOGLE_TASKS_PROVIDER).maybeSingle()
  if(error) return NextResponse.json({error:'Could not read Google Tasks connection'},{status:500})
  return NextResponse.json({...googleTasksStatus(data),eligible:true,
    setup_error:googleCalendarSetupError() || integrationCredentialsKeySetupError('Google Tasks'),
  },{headers:{'Cache-Control':'no-store'}})
}
