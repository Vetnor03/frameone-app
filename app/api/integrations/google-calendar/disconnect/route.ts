import { NextResponse } from 'next/server'
import { disconnectIntegrationForUser } from '@/app/lib/integrations/disconnect'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { GOOGLE_CALENDAR_PROVIDER } from '@/app/lib/integrations/google-calendar/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await disconnectIntegrationForUser(userId, GOOGLE_CALENDAR_PROVIDER))
  } catch {
    return NextResponse.json({ error: 'Could not disconnect Google Calendar' }, { status: 500 })
  }
}
