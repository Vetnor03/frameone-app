import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { previewCalendarLink } from '@/app/lib/integrations/calendar-link/server'
export const runtime = 'nodejs'
export async function POST(req: Request) {
  if (!await getAuthenticatedUserId(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    return NextResponse.json(await previewCalendarLink(body?.url, body?.label), { headers: { 'Cache-Control': 'no-store' } })
  } catch(error) {
    const message = error instanceof Error && /^(Enter|Calendar links|Calendar host|Calendar name|This link|Invalid iCal|Not an iCal|Could not read|Calendar feed|Calendar contains|Calendar recurrence|This calendar uses)/.test(error.message)
      ? error.message : 'Could not preview calendar link'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
