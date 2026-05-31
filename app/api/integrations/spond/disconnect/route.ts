import { NextResponse } from 'next/server'
import { disconnectIntegrationForUser } from '@/app/lib/integrations/disconnect'
import { getAuthenticatedUserId, SPOND_PROVIDER } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    return NextResponse.json(await disconnectIntegrationForUser(userId, SPOND_PROVIDER))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to disconnect Spond'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
