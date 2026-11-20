import { NextRequest, NextResponse } from 'next/server'
import { connectTodoistForUser, TODOIST_OAUTH_COOKIE, verifyTodoistOAuthState } from '@/app/lib/integrations/todoist/server'
export const runtime = 'nodejs'

function returnToApp(req: NextRequest, status: 'connected' | 'error', message?: string) {
  const url = new URL('/', req.url)
  url.searchParams.set('todoist', status)
  if (message) url.searchParams.set('message', message.slice(0, 140))
  const response = NextResponse.redirect(url)
  response.cookies.delete({ name: TODOIST_OAUTH_COOKIE, path: '/api/integrations/todoist/callback' })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  if (url.searchParams.has('error')) return returnToApp(req, 'error', 'Todoist authorization was cancelled.')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const nonce = req.cookies.get(TODOIST_OAUTH_COOKIE)?.value
  if (!code || !state || !nonce || code.length > 2048) return returnToApp(req, 'error', 'Todoist connection expired. Please try again.')
  try {
    const userId = verifyTodoistOAuthState(state, nonce)
    await connectTodoistForUser(userId, code)
    return returnToApp(req, 'connected')
  } catch (error) {
    console.warn('[todoist:callback]', error instanceof Error ? error.constructor.name : 'unknown')
    return returnToApp(req, 'error', 'Could not connect Todoist. Please try again.')
  }
}
