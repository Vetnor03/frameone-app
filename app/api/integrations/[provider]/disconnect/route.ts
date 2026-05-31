import { NextResponse } from 'next/server'
import { disconnectIntegrationForUser, normalizeDisconnectableIntegrationProvider } from '@/app/lib/integrations/disconnect'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ provider: string }>
}

export async function POST(req: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { provider: rawProvider } = await context.params
  const provider = normalizeDisconnectableIntegrationProvider(rawProvider || '')
  if (!provider) return NextResponse.json({ error: 'Unsupported integration provider' }, { status: 400 })

  try {
    return NextResponse.json(await disconnectIntegrationForUser(userId, provider))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to disconnect integration'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
