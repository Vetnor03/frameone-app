import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { exchangeCodeForTokens, fetchMicrosoftProfile, storeTeamsConnection, syncTeamsMeetingsForUser } from '@/app/lib/integrations/teams/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getUserId(cookieStore: Awaited<ReturnType<typeof cookies>>) {
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
  const cookieStore = await cookies()
  const resp = (path: string) => {
    const response = NextResponse.redirect(new URL(path, req.url))
    response.cookies.delete('teams_oauth_state')
    return response
  }

  try {
    const url = new URL(req.url)
    const error = url.searchParams.get('error')
    if (error) return resp(`/?teams=error&message=${encodeURIComponent(url.searchParams.get('error_description') || error)}`)

    const code = url.searchParams.get('code') || ''
    const state = url.searchParams.get('state') || ''
    const expectedState = cookieStore.get('teams_oauth_state')?.value || ''
    if (!code || !state || !expectedState || state !== expectedState) return resp('/?teams=error&message=Invalid%20Microsoft%20OAuth%20state')

    const userId = await getUserId(cookieStore)
    if (!userId) return resp('/login?next=/')

    const tokens = await exchangeCodeForTokens(code)
    const profile = await fetchMicrosoftProfile(tokens.accessToken)
    await storeTeamsConnection(userId, tokens, profile)
    await syncTeamsMeetingsForUser(userId, tokens.accessToken)

    return resp('/?teams=connected')
  } catch (error: unknown) {
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Microsoft auth failed')
    return resp(`/?teams=error&message=${message}`)
  }
}
