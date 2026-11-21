import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { disconnectIntegrationForUser } from '@/app/lib/integrations/disconnect'
export const runtime = 'nodejs'
export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await disconnectIntegrationForUser(userId, 'calendar-link'))
  } catch {
    return NextResponse.json({ error: 'Could not disconnect calendar links' }, { status: 500 })
  }
}
