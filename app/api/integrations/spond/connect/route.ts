import { NextResponse } from 'next/server'
import { integrationCredentialsKeyUserMessage, isIntegrationCredentialsKeyConfigError, logIntegrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { getAuthenticatedUserId, publicIntegrationStatus, spondUserMessage, syncSpondForUser } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

const CONNECT_ATTEMPT_LIMIT = 5
const CONNECT_ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const connectAttempts = new Map<string, { count: number; resetAt: number }>()

function rateLimitKey(req: Request, userId: string) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return `${userId}:${forwarded || 'unknown'}`
}

function checkConnectRateLimit(req: Request, userId: string) {
  const key = rateLimitKey(req, userId)
  const now = Date.now()
  const current = connectAttempts.get(key)
  if (!current || current.resetAt <= now) {
    connectAttempts.set(key, { count: 1, resetAt: now + CONNECT_ATTEMPT_WINDOW_MS })
    return false
  }
  if (current.count >= CONNECT_ATTEMPT_LIMIT) return true
  current.count += 1
  connectAttempts.set(key, current)
  return false
}

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (checkConnectRateLimit(req, userId)) {
    return NextResponse.json({ error: 'Too many Spond connection attempts. Try again later.' }, { status: 429 })
  }

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
    if (isIntegrationCredentialsKeyConfigError(error)) logIntegrationCredentialsKeySetupError('Spond')
    const message = isIntegrationCredentialsKeyConfigError(error)
      ? integrationCredentialsKeyUserMessage('Spond')
      : spondUserMessage(error)
    const status = message.includes('limiting') ? 429 : isIntegrationCredentialsKeyConfigError(error) ? 500 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
