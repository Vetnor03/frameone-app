import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeFrameName } from '../../../lib/frameName.mjs'

export const runtime = 'nodejs'

function bearerFromRequest(request: Request) {
  return (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ''
}

export async function POST(request: Request) {
  const token = bearerFromRequest(request)
  if (!token) return NextResponse.json({ ok: false, error: 'missing_auth_token' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const deviceId = typeof body?.device_id === 'string' ? body.device_id.trim() : ''
  const name = normalizeFrameName(body?.display_name)
  if (!deviceId) return NextResponse.json({ ok: false, error: 'missing_device_id' }, { status: 400 })
  if (!name.ok) return NextResponse.json({ ok: false, error: name.error }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return NextResponse.json({ ok: false, error: 'rename_unavailable' }, { status: 500 })

  // Use the caller's JWT, not the service role. The RPC and its database trigger
  // independently require an owner membership for this exact device.
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const auth = await supabase.auth.getUser(token)
  if (!auth.data.user) return NextResponse.json({ ok: false, error: 'invalid_auth_token' }, { status: 401 })

  const { data, error } = await supabase.rpc('rename_owned_frame', {
    p_device_id: deviceId,
    p_display_name: name.name,
  })
  if (error) {
    const forbidden = error.message.includes('frame_owner_required')
    return NextResponse.json({ ok: false, error: forbidden ? 'frame_owner_required' : 'rename_failed' }, { status: forbidden ? 403 : 500 })
  }

  return NextResponse.json({ ok: true, frame: data }, { status: 200 })
}
