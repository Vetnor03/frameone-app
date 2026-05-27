import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

type DeviceMemberRow = {
  device_id: string
  role: string | null
}

export async function GET() {
  const requestStartedAt = Date.now()
  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeoutId))
    })

  try {
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

  const { data: userData, error: userError } = await withTimeout(
    supabase.auth.getUser(),
    2500,
    'auth_get_user_timeout_2500ms'
  )
  const user = userData.user
  if (userError || !user) {
    console.info('[API] /api/device/user-frames unauthorized', { durationMs: Date.now() - requestStartedAt })
    return NextResponse.json({ ok: false, error: 'unauthorized', details: userError?.message ?? null }, { status: 401 })
  }

  const { data: members, error } = await withTimeout(
    supabase
      .from('device_members')
      .select('device_id, role')
      .eq('user_id', user.id)
      .order('device_id', { ascending: true }),
    3000,
    'device_members_query_timeout_3000ms'
  )

  if (error) {
    console.info('[API] /api/device/user-frames query error', { durationMs: Date.now() - requestStartedAt, error: error.message })
    return NextResponse.json({ ok: false, error: 'device_members_query_failed', details: error.message }, { status: 500 })
  }

  const frames: DeviceMemberRow[] = (members ?? []).map((member) => ({
    device_id: member.device_id,
    role: member.role,
  }))

  const durationMs = Date.now() - requestStartedAt
  console.info('[API] /api/device/user-frames success', { durationMs, frameCount: frames.length })
  return NextResponse.json({ ok: true, frames, durationMs })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.info('[API] /api/device/user-frames unexpected error', { durationMs: Date.now() - requestStartedAt, error: message })
    return NextResponse.json({ ok: false, error: 'user_frames_unexpected_error', details: message }, { status: 500 })
  }
}
