import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { syncBonnetidIfStale } from '@/app/lib/integrations/bonnetid/server'

export const runtime = 'nodejs'
export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json(await syncBonnetidIfStale(userId)) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not sync Bønnetid' }, { status: 502 }) }
}
