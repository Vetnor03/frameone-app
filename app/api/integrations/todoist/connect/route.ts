import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { todoistAuthUrl, todoistSetupError } from '@/app/lib/integrations/todoist/client'
import { createTodoistOAuthState, TODOIST_OAUTH_COOKIE } from '@/app/lib/integrations/todoist/server'

export const runtime = 'nodejs'
export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const configError = todoistSetupError() || integrationCredentialsKeySetupError('Todoist')
  if (configError) return NextResponse.json({ error: configError.message }, { status: 503 })
  try {
    const { state, nonce } = createTodoistOAuthState(userId)
    const response = NextResponse.json({ url: todoistAuthUrl(state) })
    response.cookies.set(TODOIST_OAUTH_COOKIE, nonce, {
      httpOnly: true, secure: new URL(req.url).protocol === 'https:',
      sameSite: 'lax', path: '/api/integrations/todoist/callback', maxAge: 900,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch {
    return NextResponse.json({ error: 'Could not start Todoist connection' }, { status: 500 })
  }
}
