import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function client(auth?: string | null) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: auth ? { Authorization: auth } : {} } })
}

export async function GET(req: Request) {
  const db = client(req.headers.get('authorization'))
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data } = await db.from('user_notification_preferences').select('push_enabled,permission_state').eq('user_id', user.id).maybeSingle()
  return NextResponse.json(data ?? { push_enabled: false, permission_state: 'default' })
}

export async function PUT(req: Request) {
  const db = client(req.headers.get('authorization'))
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { push_enabled?: boolean; permission_state?: string }
  const row = { user_id: user.id, push_enabled: body.push_enabled === true, permission_state: ['default','granted','denied','unsupported'].includes(String(body.permission_state)) ? String(body.permission_state) : 'default' }
  const { error } = await db.from('user_notification_preferences').upsert(row, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, ...row })
}
