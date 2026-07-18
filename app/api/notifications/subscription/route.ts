import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function userClient(auth?: string | null) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: auth ? { Authorization: auth } : {} } })
}

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const authDb = userClient(authHeader)
  const { data: { user } } = await authDb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as any
  const endpoint = String(body?.endpoint || '')
  const p256dh = String(body?.keys?.p256dh || '')
  const auth = String(body?.keys?.auth || '')
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 })

  const { data, error } = await serviceClient().rpc('service_register_push_subscription', {
    p_user_id: user.id,
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: req.headers.get('user-agent'),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, subscription_id: data })
}
