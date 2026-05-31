import { NextResponse } from 'next/server'
import { integrationCredentialsKeyUserMessage, isIntegrationCredentialsKeyConfigError, logIntegrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { exchangeMicrosoftCode, getMicrosoftRedirectUri, logMicrosoftOAuthConfigError, microsoftOAuthUserMessage } from '@/app/lib/integrations/teams/client'
import { parseTeamsOAuthState, syncTeamsForUser } from '@/app/lib/integrations/teams/server'

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

function appRedirect(req: Request, status: 'connected' | 'error', message?: string) {
  const url = new URL('/', req.url)
  url.searchParams.set('teams', status)
  if (message) url.searchParams.set('message', message.slice(0, 180))
  return NextResponse.redirect(url)
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const error = url.searchParams.get('error')
    if (error) return appRedirect(req, 'error', url.searchParams.get('error_description') || error)

    const code = url.searchParams.get('code')
    const rawState = url.searchParams.get('state')
    if (!code || !rawState) return appRedirect(req, 'error', 'Microsoft OAuth callback was missing code or state.')

    const state = parseTeamsOAuthState(rawState)
    const tokenSet = await exchangeMicrosoftCode(code, getMicrosoftRedirectUri(req))
    await syncTeamsForUser(state.user_id, tokenSet, state.time_zone)
    return appRedirect(req, 'connected')
  } catch (error: unknown) {
    return appRedirect(req, 'error', teamsAuthErrorMessage(error))
  }
}
