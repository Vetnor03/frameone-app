import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { searchWasteAddresses } from '@/app/lib/integrations/waste/server'

export const runtime = 'nodejs'
export async function GET(request: Request) {
  if (!await getAuthenticatedUserId(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const query = new URL(request.url).searchParams.get('q') || ''
  if (query.trim().length < 3) return NextResponse.json({ addresses: [] })
  try { return NextResponse.json({ addresses: await searchWasteAddresses(query) }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Address search failed.' }, { status: 502 }) }
}
