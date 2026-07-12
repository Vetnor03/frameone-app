import { NextResponse } from 'next/server'
import { disconnectLocalEventsForUser } from '@/app/lib/integrations/local-events/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await disconnectLocalEventsForUser(userId)
  return NextResponse.json({ connected: false })
}
