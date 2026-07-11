import { NextResponse } from 'next/server'
import { debugLocalEvents } from '@/app/lib/integrations/local-events/providers/friskus'

export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const url = new URL(req.url)
  const municipality = url.searchParams.get('municipality') || '1103'
  try {
    return NextResponse.json(await debugLocalEvents(municipality))
  } catch (error) {
    return NextResponse.json({ error: 'Could not load local events', details: error instanceof Error ? error.message : String(error) }, { status: 502 })
  }
}
