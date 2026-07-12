import { NextResponse } from 'next/server'
import { connectLocalEventsForUser, localEventUserMessage } from '@/app/lib/integrations/local-events/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  try {
    const result = await connectLocalEventsForUser(userId, body?.areaPreference)
    return NextResponse.json({ connected: true, areaPreference: result.areaPreference, importedCount: result.importedCount, zeroEvents: result.zeroEvents, account: result.external_account_label, last_sync_at: result.last_sync_at })
  } catch (error) {
    return NextResponse.json({ error: localEventUserMessage(error) }, { status: 502 })
  }
}
