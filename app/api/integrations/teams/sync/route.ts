import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import {
  DEFAULT_TEAMS_CALENDAR_HORIZON_DAYS,
  syncTeamsFromStoredConnection,
} from '@/app/lib/integrations/teams/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await syncTeamsFromStoredConnection(userId, {
      horizonDays: DEFAULT_TEAMS_CALENDAR_HORIZON_DAYS,
    })
    return NextResponse.json({
      connected: result.connected,
      meeting_count: result.meetings.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync Teams calendar' },
      { status: 500 }
    )
  }
}
