import { NextResponse } from 'next/server'
import { getAuthenticatedUserId, publicIntegrationStatus, spondUserMessage, syncSpondFromStoredConnection } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await syncSpondFromStoredConnection(userId, { force: true })
    return NextResponse.json({ provider: 'spond', connected: result.connected, skipped: result.skipped, item_count: result.itemCount })
  } catch (error) {
    return NextResponse.json({ ...publicIntegrationStatus({ status: 'reconnect_required' }), error: spondUserMessage(error) }, { status: 400 })
  }
}
