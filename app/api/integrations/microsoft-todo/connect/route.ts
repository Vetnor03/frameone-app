import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { buildMicrosoftAuthUrl, getMicrosoftOAuthConfigStatus, getMicrosoftRedirectUri } from '@/app/lib/integrations/teams/client'
import { buildTeamsOAuthState, normalizeTimeZone } from '@/app/lib/integrations/teams/server'
import { MICROSOFT_TODO_OAUTH_COOKIE, newMicrosoftTodoNonce } from '@/app/lib/integrations/microsoft-todo/server'
import { MICROSOFT_TODO_SCOPES } from '@/app/lib/integrations/microsoft-todo/client'

export const runtime = 'nodejs'
export async function POST(req: NextRequest) {
  const userId=await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({error:'Unauthorized'},{status:401})
  const keyError=integrationCredentialsKeySetupError('Microsoft To Do')
  if (!getMicrosoftOAuthConfigStatus().configured || keyError) {
    return NextResponse.json({error:'Microsoft To Do connection is not configured on the server'},{status:503})
  }
  try{
    const nonce=newMicrosoftTodoNonce()
    const zone=normalizeTimeZone(req.headers.get('x-remind-timezone'))
    const state=buildTeamsOAuthState(userId,zone,'microsoft-todo',nonce)
    // Reuse the already registered Microsoft Calendar callback URI and application,
    // but request only Tasks.Read for this separate integration.
    const redirectUri=getMicrosoftRedirectUri(req)
    const response=NextResponse.json({url:buildMicrosoftAuthUrl(state,redirectUri,MICROSOFT_TODO_SCOPES)})
    response.cookies.set(MICROSOFT_TODO_OAUTH_COOKIE,nonce,{
      httpOnly:true,secure:new URL(req.url).protocol==='https:',
      sameSite:'lax',path:'/api/integrations/teams/callback',maxAge:900,
    })
    response.headers.set('Cache-Control','no-store')
    return response
  }catch{
    return NextResponse.json({error:'Could not start Microsoft To Do authorization'},{status:500})
  }
}
