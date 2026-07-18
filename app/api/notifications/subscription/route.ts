import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function client(auth?: string | null) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: auth ? { Authorization: auth } : {} } })
}

export async function POST(req: Request) {
  const db = client(req.headers.get('authorization'))
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null) as any
  const endpoint = String(body?.endpoint || '')
  const p256dh = String(body?.keys?.p256dh || '')
  const auth = String(body?.keys?.auth || '')
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 })
  const { error } = await db.from('user_push_subscriptions').upsert({ user_id: user.id, endpoint, p256dh, auth, user_agent: req.headers.get('user-agent'), enabled: true, last_error: null }, { onConflict: 'user_id,endpoint' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
