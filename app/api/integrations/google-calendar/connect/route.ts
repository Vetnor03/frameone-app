import { createHash, randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { googleCalendarAuthUrl, googleCalendarSetupError } from '@/app/lib/integrations/google-calendar/client'
import { GOOGLE_OAUTH_COOKIE, makeGoogleOAuthState } from '@/app/lib/integrations/google-calendar/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const configError = googleCalendarSetupError()
  if (configError) return NextResponse.json({ error: configError.message }, { status: 503 })
  try {
    const { state, nonce } = makeGoogleOAuthState(userId, req.headers.get('x-remind-timezone') || 'Europe/Oslo')
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const response = NextResponse.json({ url: googleCalendarAuthUrl(state, challenge) })
    response.cookies.set(GOOGLE_OAUTH_COOKIE, nonce + '.' + verifier, {
      httpOnly: true,
      secure: new URL(req.url).protocol === 'https:',
      sameSite: 'lax',
      path: '/api/integrations/google-calendar/callback',
      maxAge: 900,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('[google-calendar:connect]', error instanceof Error ? error.message : 'setup failed')
    return NextResponse.json({ error: 'Could not start Google Calendar connection' }, { status: 500 })
  }
}
