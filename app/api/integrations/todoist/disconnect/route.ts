import { NextResponse } from 'next/server'
import { disconnectIntegrationForUser } from '@/app/lib/integrations/disconnect'
import { decryptJson } from '@/app/lib/integrations/credentialsCrypto'
import { getAuthenticatedUserId, getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { type TodoistCredentials } from '@/app/lib/integrations/todoist/client'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const admin = getSupabaseAdmin()
    const { data } = await admin.from('user_integrations').select('encrypted_credentials')
      .eq('user_id', userId).eq('provider', 'todoist').eq('status', 'connected').maybeSingle()
    if (data?.encrypted_credentials && process.env.TODOIST_CLIENT_ID && process.env.TODOIST_CLIENT_SECRET) {
      try {
        const { access_token } = decryptJson<TodoistCredentials>(data.encrypted_credentials)
        const auth = Buffer.from(process.env.TODOIST_CLIENT_ID + ':' + process.env.TODOIST_CLIENT_SECRET).toString('base64')
        await fetch('https://api.todoist.com/api/v1/revoke', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + auth },
          body: new URLSearchParams({ token: access_token, token_type_hint: 'access_token' }),
          cache: 'no-store', signal: AbortSignal.timeout(4000),
        })
      } catch { /* Revocation is best-effort; local credentials must be removed. */ }
    }
    return NextResponse.json(await disconnectIntegrationForUser(userId, 'todoist'))
  } catch {
    return NextResponse.json({ error: 'Could not disconnect Todoist' }, { status: 500 })
  }
}
