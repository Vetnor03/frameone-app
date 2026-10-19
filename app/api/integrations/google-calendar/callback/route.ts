import { NextRequest, NextResponse } from 'next/server'
import { exchangeGoogleCode } from '@/app/lib/integrations/google-calendar/client'
import { connectGoogleCalendarForUser, GOOGLE_OAUTH_COOKIE, verifyGoogleOAuthState } from '@/app/lib/integrations/google-calendar/server'

export const runtime = 'nodejs'

function redirectBack(req: NextRequest, status: 'connected' | 'error', message?: string) {
  const url = new URL('/', req.url)
  url.searchParams.set('google_calendar', status)
  if (message) url.searchParams.set('message', message.slice(0, 160))
  const response = NextResponse.redirect(url)
  response.cookies.delete({ name: GOOGLE_OAUTH_COOKIE, path: '/api/integrations/google-calendar/callback' })
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  if (url.searchParams.has('error')) return redirectBack(req, 'error', 'Google Calendar access was cancelled or denied.')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookie = req.cookies.get(GOOGLE_OAUTH_COOKIE)?.value || ''
  const [nonce, verifier] = cookie.split('.')
  if (!code || !state || !nonce || !verifier) return redirectBack(req, 'error', 'Google Calendar connection expired. Please try again.')
  try {
    const { userId, timeZone } = verifyGoogleOAuthState(state, nonce)
    const tokens = await exchangeGoogleCode(code, verifier)
    await connectGoogleCalendarForUser(userId, tokens, timeZone)
    return redirectBack(req, 'connected')
  } catch (error) {
    console.error('[google-calendar:callback]', error instanceof Error ? error.message : 'connection failed')
    return redirectBack(req, 'error', 'Could not connect Google Calendar. Please retry.')
  }
}
