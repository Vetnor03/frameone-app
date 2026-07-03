import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function bearerFromRequest(req: Request) {
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || ''
}

export async function POST(req: Request) {
  try {
    const token = bearerFromRequest(req)
    if (!token) return NextResponse.json({ ok: false, error: 'missing_auth_token' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as { device_id?: unknown } | null
    const deviceId = String(body?.device_id ?? '').trim()
    if (!deviceId) return NextResponse.json({ ok: false, error: 'missing_device_id' }, { status: 400 })

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const auth = await supabase.auth.getUser(token)
    const userId = auth.data.user?.id
    if (!userId) return NextResponse.json({ ok: false, error: 'invalid_auth_token' }, { status: 401 })

    const member = await supabase
      .from('device_members')
      .select('role')
      .eq('device_id', deviceId)
      .eq('user_id', userId)
      .maybeSingle()

    if (member.error) return NextResponse.json({ ok: false, error: member.error.message }, { status: 500 })
    if (!member.data) return NextResponse.json({ ok: false, error: 'frame_not_found' }, { status: 404 })

    const remove = await supabase
      .from('device_members')
      .delete()
      .eq('device_id', deviceId)
      .eq('user_id', userId)

    if (remove.error) return NextResponse.json({ ok: false, error: remove.error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
