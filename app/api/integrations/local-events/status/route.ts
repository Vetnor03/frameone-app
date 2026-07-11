import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { getLocalEventsStatus } from '@/app/lib/integrations/local-events/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json(await getLocalEventsStatus(userId))
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load local events status' }, { status: 500 })
  }
}
