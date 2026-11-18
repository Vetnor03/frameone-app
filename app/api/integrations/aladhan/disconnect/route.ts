import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { disconnectAladhanForUser } from '@/app/lib/integrations/aladhan/server'
export const runtime = 'nodejs'
export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json(await disconnectAladhanForUser(userId)) }
  catch { return NextResponse.json({ error: 'Could not disconnect AlAdhan.' }, { status: 500 }) }
}
