import { createHash, randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { googleTasksAuthUrl, googleTasksSetupError } from '@/app/lib/integrations/google-tasks/client'
import { makeGoogleOAuthState } from '@/app/lib/integrations/google-calendar/server'
import { GOOGLE_TASKS_OAUTH_COOKIE } from '@/app/lib/integrations/google-tasks/server'

export const runtime = 'nodejs'
export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (googleTasksSetupError() || integrationCredentialsKeySetupError('Google Tasks')) {
    return NextResponse.json({ error: 'Google Tasks connection is not configured on the server' }, { status: 503 })
  }
  try {
    const { state, nonce } = makeGoogleOAuthState(userId, req.headers.get('x-remind-timezone') || 'Europe/Oslo')
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const response = NextResponse.json({ url: googleTasksAuthUrl(state, challenge) })
    response.cookies.set(GOOGLE_TASKS_OAUTH_COOKIE, nonce + '.' + verifier, {
      httpOnly: true,
      secure: new URL(req.url).protocol === 'https:',
      sameSite: 'lax',
      path: '/api/integrations/google-tasks/callback',
      maxAge: 900,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch {
    return NextResponse.json({ error: 'Could not start Google Tasks authorization' }, { status: 500 })
  }
}
