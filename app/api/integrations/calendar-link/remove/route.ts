import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { removeCalendarFeed } from '@/app/lib/integrations/calendar-link/server'
export const runtime = 'nodejs'
export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    return NextResponse.json(await removeCalendarFeed(userId, body?.id), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Could not remove calendar subscription' }, { status: 400 })
  }
}
