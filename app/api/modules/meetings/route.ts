import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { getTeamsMeetingsForUser } from '@/app/lib/integrations/teams/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const meetings = await getTeamsMeetingsForUser(userId, true)
    return NextResponse.json({ generated_at: new Date().toISOString(), meetings })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load meetings' }, { status: 500 })
  }
}
