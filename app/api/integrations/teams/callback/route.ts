import { NextRequest, NextResponse } from 'next/server'
import { integrationCredentialsKeyUserMessage, isIntegrationCredentialsKeyConfigError, logIntegrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { exchangeMicrosoftCode, getMicrosoftRedirectUri, logMicrosoftOAuthConfigError, microsoftOAuthUserMessage } from '@/app/lib/integrations/teams/client'
import { parseTeamsOAuthState, syncTeamsForUser } from '@/app/lib/integrations/teams/server'
import { MICROSOFT_TODO_SCOPES } from '@/app/lib/integrations/microsoft-todo/client'
import { connectMicrosoftTodoForUser, MICROSOFT_TODO_OAUTH_COOKIE, verifyMicrosoftTodoNonce } from '@/app/lib/integrations/microsoft-todo/server'

export const runtime = 'nodejs'

function teamsAuthErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Microsoft auth failed'
  if (isIntegrationCredentialsKeyConfigError(error)) {
    logIntegrationCredentialsKeySetupError('Teams')
    return integrationCredentialsKeyUserMessage('Teams')
  }
  if (error.message.startsWith('Missing MICROSOFT_')) {
    logMicrosoftOAuthConfigError('teams-callback')
    return microsoftOAuthUserMessage()
  }
  return error.message
}

function appRedirect(req: NextRequest, provider: 'teams' | 'microsoft-todo', status: 'connected' | 'error', message?: string) {
  const url = new URL('/', req.url)
  url.searchParams.set(provider === 'microsoft-todo' ? 'microsoft_todo' : 'teams', status)
  if (message) url.searchParams.set('message', message.slice(0, 180))
  const response = NextResponse.redirect(url)
  if (provider === 'microsoft-todo') {
    response.cookies.delete({ name: MICROSOFT_TODO_OAUTH_COOKIE, path: '/api/integrations/teams/callback' })
  }
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function GET(req: NextRequest) {
  // The signed state determines the integration, not a user-supplied provider query param.
  // A one-time browser nonce prevents a callback from another browser completing To Do.
  let purpose: 'teams' | 'microsoft-todo' = req.cookies.has(MICROSOFT_TODO_OAUTH_COOKIE) ? 'microsoft-todo' : 'teams'
  try {
    const url = new URL(req.url)
    const error = url.searchParams.get('error')
    if (error) return appRedirect(req, purpose, 'error', purpose === 'microsoft-todo' ? 'Microsoft To Do authorization was cancelled.' : (url.searchParams.get('error_description') || error))

    const code = url.searchParams.get('code')
    const rawState = url.searchParams.get('state')
    if (!code || !rawState || code.length > 4096) return appRedirect(req, purpose, 'error', 'Microsoft authorization expired. Please try again.')

    const state = parseTeamsOAuthState(rawState)
    purpose = state.purpose === 'microsoft-todo' ? 'microsoft-todo' : 'teams'
    if (purpose === 'microsoft-todo') {
      const browserNonce = req.cookies.get(MICROSOFT_TODO_OAUTH_COOKIE)?.value
      if (!verifyMicrosoftTodoNonce(state.nonce, browserNonce)) return appRedirect(req, purpose, 'error', 'Microsoft To Do sign-in expired. Please try again.')
      const tokenSet = await exchangeMicrosoftCode(code, getMicrosoftRedirectUri(req), MICROSOFT_TODO_SCOPES)
      await connectMicrosoftTodoForUser(state.user_id, tokenSet, state.time_zone)
      return appRedirect(req, purpose, 'connected')
    }

    const tokenSet = await exchangeMicrosoftCode(code, getMicrosoftRedirectUri(req))
    await syncTeamsForUser(state.user_id, tokenSet, state.time_zone)
    return appRedirect(req, 'teams', 'connected')
  } catch (error: unknown) {
    if (purpose === 'microsoft-todo') {
      console.warn('[microsoft-todo:callback]', error instanceof Error ? error.constructor.name : 'unknown')
      return appRedirect(req, purpose, 'error', 'Could not connect Microsoft To Do. Please try again.')
    }
    return appRedirect(req, 'teams', 'error', teamsAuthErrorMessage(error))
  }
}
