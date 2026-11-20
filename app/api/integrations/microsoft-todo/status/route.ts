import { NextResponse } from 'next/server'
import { getAuthenticatedUserId, getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { getMicrosoftOAuthConfigStatus } from '@/app/lib/integrations/teams/client'
import { MICROSOFT_TODO_PROVIDER } from '@/app/lib/integrations/microsoft-todo/server'
export const runtime='nodejs'
export async function GET(req:Request){
  const userId=await getAuthenticatedUserId(req)
  if(!userId)return NextResponse.json({error:'Unauthorized'},{status:401})
  const {data,error}=await getSupabaseAdmin().from('user_integrations')
    .select('status,external_account_label,last_sync_at')
    .eq('user_id',userId).eq('provider',MICROSOFT_TODO_PROVIDER).maybeSingle()
  if(error)return NextResponse.json({error:'Could not read Microsoft To Do connection'},{status:500})
  const configured=getMicrosoftOAuthConfigStatus().configured
  return NextResponse.json({
    provider:MICROSOFT_TODO_PROVIDER,connected:data?.status==='connected',
    status:data?.status||'disconnected',account:data?.external_account_label||null,
    last_sync_at:data?.last_sync_at||null,
    setup_error: !configured ? {message:'Microsoft To Do server authorization is not configured'} : integrationCredentialsKeySetupError('Microsoft To Do'),
  },{headers:{'Cache-Control':'no-store'}})
}
