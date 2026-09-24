import { NextResponse } from 'next/server'
import { syncAllWasteUsers } from '@/app/lib/integrations/waste/server'
import { syncAllConnectedLocalEventsFrames } from '@/app/lib/integrations/local-events/server'

export const runtime = 'nodejs'

function settledResult<T>(result: PromiseSettledResult<T>) {
  return result.status === 'fulfilled'
    ? { ok: true, result: result.value }
    : { ok: false, error: result.reason instanceof Error ? result.reason.message : 'Sync failed' }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [waste, localEvents] = await Promise.allSettled([
    syncAllWasteUsers(),
    syncAllConnectedLocalEventsFrames(),
  ])
  const ok = waste.status === 'fulfilled' && localEvents.status === 'fulfilled'

  return NextResponse.json(
    { ok, waste: settledResult(waste), localEvents: settledResult(localEvents) },
    { status: ok ? 200 : 500 },
  )
}
