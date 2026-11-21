import { createHash, randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { googleCalendarAuthUrl, googleCalendarSetupError } from '@/app/lib/integrations/google-calendar/client'
import { makeGoogleOAuthState } from '@/app/lib/integrations/google-calendar/server'
import { GOOGLE_TASKS_SCOPES } from '@/app/lib/integrations/google-tasks/client'
import { GOOGLE_TASKS_OAUTH_COOKIE, googleTasksAllowedForUser } from '@/app/lib/integrations/google-tasks/server'

export const runtime = 'nodejs'
export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({error:'Unauthorized'},{status:401})
  if (!googleTasksAllowedForUser(userId)) return NextResponse.json({error:'Google Tasks is awaiting Google verification'},{status:403})
  const setupError = googleCalendarSetupError() || integrationCredentialsKeySetupError('Google Tasks')
  if (setupError) return NextResponse.json({error:setupError.message},{status:503})
  try {
    const {state,nonce} = makeGoogleOAuthState(userId,req.headers.get('x-remind-timezone') || 'Europe/Oslo','google-tasks')
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const response = NextResponse.json({url:googleCalendarAuthUrl(state,challenge,GOOGLE_TASKS_SCOPES)})
    response.cookies.set(GOOGLE_TASKS_OAUTH_COOKIE,nonce + '.' + verifier,{
      httpOnly:true,secure:new URL(req.url).protocol === 'https:',sameSite:'lax',
      path:'/api/integrations/google-calendar/callback',maxAge:900,
    })
    response.headers.set('Cache-Control','no-store')
    return response
  }catch(error){
    console.warn('[google-tasks:connect]',error instanceof Error ? error.message:'failed')
    return NextResponse.json({error:'Could not start Google Tasks authorization'},{status:500})
  }
}
