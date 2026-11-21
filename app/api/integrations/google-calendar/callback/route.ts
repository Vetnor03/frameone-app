import { NextRequest, NextResponse } from 'next/server'
import { exchangeGoogleCode } from '@/app/lib/integrations/google-calendar/client'
import { connectGoogleCalendarForUser, GOOGLE_OAUTH_COOKIE, verifyGoogleOAuthState } from '@/app/lib/integrations/google-calendar/server'
import { connectGoogleTasksForUser, GOOGLE_TASKS_OAUTH_COOKIE } from '@/app/lib/integrations/google-tasks/server'

export const runtime = 'nodejs'
type Purpose = 'google-calendar' | 'google-tasks'

function redirectBack(req: NextRequest, purpose: Purpose, status: 'connected' | 'error', message?: string) {
  const url = new URL('/', req.url)
  url.searchParams.set(purpose === 'google-tasks' ? 'google_tasks' : 'google_calendar', status)
  if (message) url.searchParams.set('message', message.slice(0, 160))
  const response = NextResponse.redirect(url)
  response.cookies.delete({ name: purpose === 'google-tasks' ? GOOGLE_TASKS_OAUTH_COOKIE : GOOGLE_OAUTH_COOKIE, path: '/api/integrations/google-calendar/callback' })
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  let purpose: Purpose = req.cookies.has(GOOGLE_TASKS_OAUTH_COOKIE) ? 'google-tasks' : 'google-calendar'
  if (url.searchParams.has('error')) return redirectBack(req, purpose, 'error', 'Google access was cancelled or denied.')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state || code.length > 4096) return redirectBack(req, purpose, 'error', 'Google connection expired. Please try again.')
  try {
    // Try each browser-bound nonce, and ONLY accept the purpose in the signed state.
    // The callback is shared with Calendar, but tasks cannot replace Calendar tokens.
    let verified: { userId: string; timeZone: string; purpose: Purpose; verifier: string } | null = null
    for (const candidate of [
      { purpose: 'google-tasks' as const, cookie: GOOGLE_TASKS_OAUTH_COOKIE },
      { purpose: 'google-calendar' as const, cookie: GOOGLE_OAUTH_COOKIE },
    ]) {
      const [nonce, verifier] = (req.cookies.get(candidate.cookie)?.value || '').split('.')
      if (!nonce || !verifier) continue
      try {
        const result = verifyGoogleOAuthState(state, nonce)
        if (result.purpose === candidate.purpose) {
          verified = {...result, verifier}
          break
        }
      } catch { /* Another integration's state must not validate this cookie. */ }
    }
    if (!verified) return redirectBack(req, purpose, 'error', 'Google connection expired. Please try again.')
    purpose = verified.purpose
    const tokens = await exchangeGoogleCode(code, verified.verifier)
    if (purpose === 'google-tasks') await connectGoogleTasksForUser(verified.userId, tokens, verified.timeZone)
    else await connectGoogleCalendarForUser(verified.userId, tokens, verified.timeZone)
    return redirectBack(req, purpose, 'connected')
  } catch (error) {
    console.warn('[google-oauth:callback]', error instanceof Error ? error.message : 'connection failed')
    return redirectBack(req, purpose, 'error', 'Could not connect Google account. Please retry.')
  }
}
