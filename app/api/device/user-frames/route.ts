import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

type DeviceMemberRow = {
  device_id: string
  role: string | null
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, error: 'missing_supabase_env' }, { status: 500 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
      },
    },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser()
  const user = userData.user
  if (userError || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data: members, error } = await supabase
    .from('device_members')
    .select('device_id, role')
    .eq('user_id', user.id)
    .order('device_id', { ascending: true })

  if (error) {
    return NextResponse.json({ ok: false, error: 'device_members_query_failed', details: error.message }, { status: 500 })
  }

  const frames: DeviceMemberRow[] = (members ?? []).map((member) => ({
    device_id: member.device_id,
    role: member.role,
  }))

  return NextResponse.json({ ok: true, frames })
}
