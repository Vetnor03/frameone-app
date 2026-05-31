import { NextResponse } from 'next/server'
import { buildMicrosoftAuthUrl, getMicrosoftRedirectUri } from '@/app/lib/integrations/teams/client'
import { buildTeamsOAuthState, getAuthenticatedTeamsUserId, normalizeTimeZone } from '@/app/lib/integrations/teams/server'

export const runtime = 'nodejs'

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
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to start Microsoft OAuth' }, { status: 500 })
  }
}
