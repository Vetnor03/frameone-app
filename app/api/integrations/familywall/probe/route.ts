import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { decryptJson, encryptJson, integrationCredentialsKeySetupError } from '@/app/lib/integrations/credentialsCrypto'
import { startFamilyWallProbe, exchangeProbeCode, discoverFamilyWallTools, type PendingProbe } from '@/app/lib/integrations/familywall/probe'

export const runtime = 'nodejs'
const path = '/api/integrations/familywall/probe'
const cookieName = '__Secure-remind_familywall_probe'
const maxAge = 600
function allowed(userId: string) {
  return process.env.FAMILYWALL_MCP_PROBE_ENABLED === 'true' &&
    (process.env.FAMILYWALL_MCP_TEST_USER_IDS || '').split(',').map(id => id.trim()).includes(userId)
}
function config() {
  const origin = new URL(process.env.FAMILYWALL_MCP_APP_ORIGIN || '')
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid probe app origin')
  const trustedOrigins = (process.env.FAMILYWALL_MCP_TRUSTED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  for (const value of trustedOrigins) {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.origin !== value) throw new Error('Invalid OAuth origin')
  }
  return { redirectUri: origin.origin + path, trustedOrigins, clientId: process.env.FAMILYWALL_MCP_CLIENT_ID, scope: process.env.FAMILYWALL_MCP_SCOPE }
}
function result(data: unknown, status = 200, clear = false) {
  const response = NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } })
  if (clear) response.cookies.set(cookieName, '', { path, secure: true, httpOnly: true, sameSite: 'lax', maxAge: 0 })
  return response
}
export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return result({ error: 'Unauthorized' }, 401)
  if (!allowed(userId)) return result({ error: 'Not found' }, 404)
  if (integrationCredentialsKeySetupError('FamilyWall')) return result({ error: 'Probe encryption unavailable' }, 503)
  try {
    const settings = config()
    if (new URL(req.url).origin !== new URL(settings.redirectUri).origin) return result({ error: 'Unexpected app origin' }, 400)
    const { url, pending } = await startFamilyWallProbe(settings)
    const response = result({ url })
    const payload = Buffer.from(JSON.stringify(encryptJson({ ...pending, userId }))).toString('base64url')
    if (payload.length > 3500) throw new Error('OAuth state exceeds cookie limit')
    response.cookies.set(cookieName, payload, { path, secure: true, httpOnly: true, sameSite: 'lax', maxAge })
    return response
  } catch { return result({ error: 'Could not start FamilyWall OAuth probe. Check endpoint discovery and client configuration.' }, 502) }
}
export async function GET(req: NextRequest) {
  if (process.env.FAMILYWALL_MCP_PROBE_ENABLED !== 'true') return result({ error: 'Not found' }, 404)
  const state = req.nextUrl.searchParams.get('state') || ''
  const code = req.nextUrl.searchParams.get('code') || ''
  const cookie = req.cookies.get(cookieName)?.value || ''
  try {
    if (!cookie || cookie.length > 3500 || !code || code.length > 4096 || state.length !== 43 || req.nextUrl.searchParams.has('error')) throw new Error('Invalid callback')
    const pending = decryptJson<PendingProbe & { userId: string }>(JSON.parse(Buffer.from(cookie, 'base64url').toString('utf8')))
    const age = Date.now() - pending.createdAt
    if (!allowed(pending.userId) || !Number.isFinite(age) || age < 0 || age > maxAge * 1000 ||
      pending.state.length !== state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))) throw new Error('Invalid state')
    const settings = config()
    if (pending.redirectUri !== settings.redirectUri || new URL(req.url).origin !== new URL(settings.redirectUri).origin) throw new Error('Invalid redirect')
    const token = await exchangeProbeCode(pending, code, settings.trustedOrigins)
    const tools = await discoverFamilyWallTools(token)
    // No user data, tool calls, database writes or token persistence in this discovery phase.
    return result({ authenticated: true, probeOnly: true, tools }, 200, true)
  } catch { return result({ error: 'FamilyWall authorization or tool discovery failed. Restart the probe.' }, 400, true) }
}
