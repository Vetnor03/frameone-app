import { NextResponse } from 'next/server'
import { integrationCredentialsKeyUserMessage, isIntegrationCredentialsKeyConfigError } from '@/app/lib/integrations/credentialsCrypto'
import { buildMicrosoftAuthUrl, getMicrosoftRedirectUri } from '@/app/lib/integrations/teams/client'
import { buildTeamsOAuthState, getAuthenticatedTeamsUserId, normalizeTimeZone } from '@/app/lib/integrations/teams/server'

export const runtime = 'nodejs'

function teamsConnectionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Failed to start Microsoft OAuth'
  if (isIntegrationCredentialsKeyConfigError(error)) {
    return integrationCredentialsKeyUserMessage()
  }
  if (error.message.startsWith('Missing MICROSOFT_')) {
    return 'Teams connection is not configured on the server yet. Add the Microsoft OAuth settings and redeploy.'
  }
  return error.message
}

function appRedirect(req: Request, message: string) {
  const url = new URL('/', req.url)
  url.searchParams.set('teams', 'error')
  url.searchParams.set('message', message.slice(0, 180))
  return NextResponse.redirect(url)
}

export async function GET(req: Request) {
  try {
    const userId = await getAuthenticatedTeamsUserId(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const timeZone = normalizeTimeZone(url.searchParams.get('tz'))
    const state = buildTeamsOAuthState(userId, timeZone)
    const authUrl = buildMicrosoftAuthUrl(state, getMicrosoftRedirectUri(req))
    return NextResponse.redirect(authUrl)
  } catch (error: unknown) {
    return appRedirect(req, teamsConnectionErrorMessage(error))
  }
}
