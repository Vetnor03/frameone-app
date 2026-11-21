import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { connectCalendarLink } from '@/app/lib/integrations/calendar-link/server'
export const runtime = 'nodejs'
export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const setupError = integrationCredentialsKeySetupError('Calendar Link')
  if (setupError) return NextResponse.json({ error: setupError.message }, { status: 503 })
  try {
    const body = await req.json()
    return NextResponse.json(await connectCalendarLink(userId, body?.url, body?.label), { headers: { 'Cache-Control': 'no-store' } })
  } catch(error) {
    const message = error instanceof Error && /^(Enter|Calendar links|Calendar host|Calendar name|This link|This calendar|Maximum|Invalid iCal|Not an iCal|Could not read|Calendar feed|Calendar contains|Calendar recurrence)/.test(error.message)
      ? error.message : 'Could not connect calendar link'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
