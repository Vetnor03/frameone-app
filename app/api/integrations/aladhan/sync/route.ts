import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { syncAladhanIfStale } from '@/app/lib/integrations/aladhan/server'
export const runtime = 'nodejs'
export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json(await syncAladhanIfStale(userId)) }
  catch { return NextResponse.json({ error: 'Could not refresh AlAdhan schedule. Saved events were kept.' }, { status: 502 }) }
}
