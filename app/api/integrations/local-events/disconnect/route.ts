import { NextResponse } from 'next/server'
import { disconnectLocalEventsForFrame, localEventUserMessage } from '@/app/lib/integrations/local-events/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const deviceId = String(body?.deviceId || body?.device_id || '').trim()
  if (!deviceId) return NextResponse.json({ error: 'Missing deviceId' }, { status: 400 })
  try {
    await disconnectLocalEventsForFrame(userId, deviceId)
    return NextResponse.json({ connected: false, deviceId })
  } catch (error) {
    return NextResponse.json({ error: localEventUserMessage(error) }, { status: 403 })
  }
}
