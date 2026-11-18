import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { getAladhanStatus } from '@/app/lib/integrations/aladhan/server'
export const runtime = 'nodejs'
export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json(await getAladhanStatus(userId)) }
  catch { return NextResponse.json({ error: 'Unable to load AlAdhan connection status.' }, { status: 500 }) }
}
