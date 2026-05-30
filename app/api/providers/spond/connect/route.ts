import { NextResponse } from 'next/server'
import { createUserServerClient } from '../../../../lib/serverAuth'
import { encryptJson } from '../../../../lib/providers/crypto'
import { SpondProviderClient } from '../../../../lib/providers/spond'
import { createAdminSupabase, syncSpondForUser } from '../../../../lib/providers/spondSync'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const { user, authError } = await createUserServerClient()
    if (!user) return NextResponse.json({ ok: false, error: authError ?? 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const username = String(body?.username ?? '').trim()
    const password = String(body?.password ?? '')

    if (!username || !password) {
      return NextResponse.json({ ok: false, error: 'Missing Spond username or password' }, { status: 400 })
    }

    const client = new SpondProviderClient({ username, password })
    await client.login()

    const supabase = createAdminSupabase()
    const now = new Date().toISOString()
    const { error } = await supabase.from('user_connected_providers').upsert(
      {
        user_id: user.id,
        provider: 'spond',
        status: 'connected',
        encrypted_credentials: encryptJson({ username, password }),
        encrypted_session: null,
        error_message: null,
        updated_at: now,
      },
      { onConflict: 'user_id,provider' }
    )

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    const sync = await syncSpondForUser(user.id, supabase).catch((syncError) => ({
      ok: false,
      error: syncError instanceof Error ? syncError.message : String(syncError),
      synced: 0,
    }))

    return NextResponse.json({ ok: true, status: 'connected', sync })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
