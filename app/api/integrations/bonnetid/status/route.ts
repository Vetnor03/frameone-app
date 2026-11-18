import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { getBonnetidStatus } from '@/app/lib/integrations/bonnetid/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json(await getBonnetidStatus(userId)) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load Bønnetid status' }, { status: 500 }) }
}
