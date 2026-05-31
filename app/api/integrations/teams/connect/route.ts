import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { microsoftAuthorizeUrl } from '@/app/lib/integrations/teams/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getUserId() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  })
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

export async function GET(req: Request) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.redirect(new URL('/login?next=/', req.url))

    const state = randomBytes(24).toString('base64url')
    const resp = NextResponse.redirect(microsoftAuthorizeUrl(state))
    resp.cookies.set('teams_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60,
      path: '/',
    })
    return resp
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to start Microsoft OAuth' }, { status: 500 })
  }
}
