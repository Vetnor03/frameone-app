import { NextRequest, NextResponse } from 'next/server'
import { exchangeGoogleTasksCode } from '@/app/lib/integrations/google-tasks/client'
import { verifyGoogleOAuthState } from '@/app/lib/integrations/google-calendar/server'
import { connectGoogleTasksForUser, GOOGLE_TASKS_OAUTH_COOKIE } from '@/app/lib/integrations/google-tasks/server'

export const runtime = 'nodejs'
function redirectBack(req: NextRequest, status: 'connected' | 'error', message?: string) {
  const url = new URL('/', req.url)
  url.searchParams.set('google_tasks', status)
  if (message) url.searchParams.set('message', message.slice(0, 160))
  const response = NextResponse.redirect(url)
  response.cookies.delete({ name: GOOGLE_TASKS_OAUTH_COOKIE, path: '/api/integrations/google-tasks/callback' })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  if (url.searchParams.has('error')) return redirectBack(req, 'error', 'Google Tasks access was cancelled or denied.')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookie = req.cookies.get(GOOGLE_TASKS_OAUTH_COOKIE)?.value || ''
  const [nonce, verifier] = cookie.split('.')
  if (!code || !state || !nonce || !verifier) return redirectBack(req, 'error', 'Google Tasks connection expired. Please retry.')
  try {
    const { userId } = verifyGoogleOAuthState(state, nonce)
    const tokens = await exchangeGoogleTasksCode(code, verifier)
    await connectGoogleTasksForUser(userId, tokens)
    return redirectBack(req, 'connected')
  } catch (error) {
    console.warn('[google-tasks:callback]', error instanceof Error ? error.constructor.name : 'unknown')
    return redirectBack(req, 'error', 'Could not connect Google Tasks. Please retry.')
  }
}
