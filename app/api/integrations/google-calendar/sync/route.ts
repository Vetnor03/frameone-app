import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { syncGoogleCalendarFromStoredConnection } from '@/app/lib/integrations/google-calendar/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await syncGoogleCalendarFromStoredConnection(userId))
  } catch (error) {
    console.warn('[google-calendar:sync]', error instanceof Error ? error.message : 'failed')
    return NextResponse.json({ error: 'Could not refresh Google Calendar. Try reconnecting if this continues.' }, { status: 502 })
  }
}
