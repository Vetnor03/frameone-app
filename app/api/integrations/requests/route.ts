import { NextResponse } from 'next/server'
import { getAuthenticatedUserId, getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { validateIntegrationRequest } from '@/app/lib/integrations/requestValidation.mjs'

export const runtime = 'nodejs'

const MAX_REQUESTS_PER_24_HOURS = 5

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const request = validateIntegrationRequest(body)
  if (!request) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const db = getSupabaseAdmin()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: countError } = await db
    .from('integration_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)

  if (countError) {
    console.error('Could not check integration request quota:', countError.code)
    return NextResponse.json({ error: 'temporarily_unavailable' }, { status: 503 })
  }
  if ((count ?? 0) >= MAX_REQUESTS_PER_24_HOURS) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const { error } = await db.from('integration_requests').insert({
    user_id: userId,
    app_name: request.appName,
    note: request.note,
  })

  if (error?.code === '23505') {
    return NextResponse.json({ error: 'already_requested' }, { status: 409 })
  }
  if (error) {
    console.error('Could not save integration request:', error.code)
    return NextResponse.json({ error: 'temporarily_unavailable' }, { status: 503 })
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
