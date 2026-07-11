import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { connectLocalEventsForUser } from '@/app/lib/integrations/local-events/server'
import { LocalEventsProviderError } from '@/app/lib/integrations/local-events/providers/friskus-rss'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    const municipalityNumber = String(body?.municipality_number || '').trim()
    if (!municipalityNumber) return NextResponse.json({ error: 'Missing municipality' }, { status: 400 })
    const result = await connectLocalEventsForUser(userId, municipalityNumber, body?.filters)
    return NextResponse.json(result, { status: result.status === 'unsupported' ? 202 : 200 })
  } catch (error: unknown) {
    if (error instanceof LocalEventsProviderError) {
      return NextResponse.json({ error: 'Could not load local events. Please try again.', message: 'Could not load local events. Please try again.', provider: 'friskus-rss', providerStatus: error.details.status }, { status: 502 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to connect local events' }, { status: 500 })
  }
}
