import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { calendarLinkStatus } from '@/app/lib/integrations/calendar-link/server'
export const runtime = 'nodejs'
export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const status = await calendarLinkStatus(userId)
    return NextResponse.json({ ...status, setup_error: integrationCredentialsKeySetupError('Calendar Link') },
      { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Could not read calendar status' }, { status: 500 })
  }
}
