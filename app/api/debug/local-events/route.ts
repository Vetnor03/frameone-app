import { NextResponse } from 'next/server'
import { debugLocalEvents, LocalEventsProviderError, serializeError } from '@/app/lib/integrations/local-events/providers/friskus'

export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const url = new URL(req.url)
  const municipality = url.searchParams.get('municipality') || '1103'
  try {
    return NextResponse.json(await debugLocalEvents(municipality))
  } catch (error) {
    if (error instanceof LocalEventsProviderError) {
      return NextResponse.json({ requestSucceeded: false, status: error.details.status, bodyPreview: error.details.responseBody, error: serializeError(error) }, { status: 502 })
    }
    return NextResponse.json({ requestSucceeded: false, error: serializeError(error) }, { status: 502 })
  }
}
