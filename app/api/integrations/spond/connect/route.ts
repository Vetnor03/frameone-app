import { NextResponse } from 'next/server'
import { integrationCredentialsKeyUserMessage, isIntegrationCredentialsKeyConfigError, logIntegrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { SpondError } from '@/app/lib/integrations/spond/client'
import { getAuthenticatedUserId, publicIntegrationStatus, syncSpondForUser } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  const username = typeof parsed.username === 'string' ? parsed.username.trim() : ''
  const password = typeof parsed.password === 'string' ? parsed.password : ''
  if (!username || !password) return NextResponse.json({ error: 'Spond username and password are required' }, { status: 400 })

  try {
    const result = await syncSpondForUser(userId, { username, password })
    return NextResponse.json({ ...publicIntegrationStatus(result.integration), item_count: result.itemCount })
  } catch (error: unknown) {
    if (error instanceof SpondError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === 'rate_limited' ? 429 : 400 })
    }
    if (isIntegrationCredentialsKeyConfigError(error)) logIntegrationCredentialsKeySetupError('Spond')
    const message = isIntegrationCredentialsKeyConfigError(error)
      ? integrationCredentialsKeyUserMessage('Spond')
      : 'Failed to connect Spond.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
