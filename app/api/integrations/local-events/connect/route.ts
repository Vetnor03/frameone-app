import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { connectLocalEventsForUser } from '@/app/lib/integrations/local-events/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const result = await connectLocalEventsForUser(userId)
    return NextResponse.json(result, { status: 202 })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load local events status' }, { status: 500 })
  }
}
