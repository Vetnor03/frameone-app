import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { syncTeamsFromStoredConnection } from '@/app/lib/integrations/teams/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizeTimeZone(value: string | null) {
  const tz = (value || 'Europe/Oslo').trim()
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
    return tz
  } catch {
    return 'Europe/Oslo'
  }
}

async function getCookieUserId() {
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
    const url = new URL(req.url)
    const timeZone = normalizeTimeZone(url.searchParams.get('tz'))
    const userId = (await getAuthenticatedUserId(req)) || (await getCookieUserId())
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await syncTeamsFromStoredConnection(userId, timeZone)
    return NextResponse.json({
      connected: result.connected,
      generated_at: new Date().toISOString(),
      timezone: timeZone,
      meetings: result.meetings,
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load meetings' }, { status: 500 })
  }
}
