import { NextResponse } from 'next/server'
import { disconnectIntegrationForUser } from '@/app/lib/integrations/disconnect'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { TEAMS_PROVIDER } from '@/app/lib/integrations/teams/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    return NextResponse.json(await disconnectIntegrationForUser(userId, TEAMS_PROVIDER))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to disconnect Teams'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
