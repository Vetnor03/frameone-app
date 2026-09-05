import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { searchKartverketAddresses } from '@/app/lib/integrations/waste/providers'
export const runtime = 'nodejs'
export async function GET(req: Request) {
  if (!(await getAuthenticatedUserId(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const query = new URL(req.url).searchParams.get('q')?.trim() || ''
  if (query.length < 3) return NextResponse.json({ addresses: [] })
  try { return NextResponse.json({ addresses: await searchKartverketAddresses(query) }) }
  catch { return NextResponse.json({ error: 'Address search is temporarily unavailable' }, { status: 503 }) }
}
