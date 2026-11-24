import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { getOutlookCalendarSelection, saveOutlookCalendarSelection } from '@/app/lib/integrations/teams/server'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store' }

export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  try {
    const result = await getOutlookCalendarSelection(userId)
    return result ? NextResponse.json(result, { headers }) : NextResponse.json({ error: 'Not connected' }, { status: 409, headers })
  } catch {
    return NextResponse.json({ error: 'Could not load Outlook calendars' }, { status: 502, headers })
  }
}

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  const body = await req.json().catch(() => null)
  const ids = body?.calendarIds
  if (!Array.isArray(ids) || !ids.length || ids.length > 20 || ids.some(id => typeof id !== 'string' || !id || id.length > 2048)) {
    return NextResponse.json({ error: 'Invalid calendar selection' }, { status: 400, headers })
  }
  try {
    const result = await saveOutlookCalendarSelection(userId, ids)
    if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 409, headers })
    if ('invalid' in result) return NextResponse.json({ error: 'Invalid calendar selection' }, { status: 400, headers })
    return NextResponse.json(result, { headers })
  } catch {
    return NextResponse.json({ error: 'Could not save Outlook calendars' }, { status: 502, headers })
  }
}
