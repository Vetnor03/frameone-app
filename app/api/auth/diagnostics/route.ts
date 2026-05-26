import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

type DbErrorLike = { code?: string; message?: string } | null

function summarizeError(error: DbErrorLike) {
  if (!error) return null
  return { code: error.code || null, message: error.message || null }
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return NextResponse.json({ ok: false }, { status: 500 })

  const cookieStore = await cookies()
  let cookieWrites = 0
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        cookieWrites += cookiesToSet.length
        for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
      },
    },
  })

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  const session = sessionData.session
  const user = userData.user

  let profileFound: boolean | null = null
  let profileError: DbErrorLike = null
  if (user?.id) {
    const { data, error } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle()
    profileFound = Boolean(data)
    profileError = error as DbErrorLike
  }

  let deviceCount = 0
  let deviceError: DbErrorLike = null
  if (user?.id) {
    const { data, error } = await supabase.from('device_members').select('device_id').eq('user_id', user.id)
    deviceCount = data?.length || 0
    deviceError = error as DbErrorLike
  }

  const onboardingReason = !session
    ? 'missing_session'
    : !user
      ? 'missing_user'
      : deviceError
        ? 'device_members_query_error'
        : deviceCount === 0
          ? 'no_device_members'
          : 'has_device_members'

  console.info('[auth.diagnostics] snapshot', {
    userId: user?.id || null,
    email: user?.email || null,
    hasSession: Boolean(session),
    sessionExpiresAt: session?.expires_at || null,
    cookieWrites,
    profileFound,
    deviceCount,
    queryErrors: {
      session: summarizeError(sessionError as DbErrorLike),
      user: summarizeError(userError as DbErrorLike),
      profile: summarizeError(profileError),
      deviceMembers: summarizeError(deviceError),
    },
    onboardingReason,
  })

  return NextResponse.json({ ok: true })
}
