import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { disconnectWasteForUser } from '@/app/lib/integrations/waste/server'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { await disconnectWasteForUser(userId); return NextResponse.json({ disconnected: true }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Disconnect failed.' }, { status: 500 }) }
}
