import { NextResponse } from 'next/server'
import { disconnectIntegrationForUser } from '@/app/lib/integrations/disconnect'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { LOCAL_EVENTS_PROVIDER } from '@/app/lib/integrations/local-events/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await disconnectIntegrationForUser(userId, LOCAL_EVENTS_PROVIDER))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to disconnect local events' }, { status: 500 })
  }
}
