import { NextResponse } from 'next/server'
import { createUserServerClient } from '../../../../lib/serverAuth'
import { createAdminSupabase } from '../../../../lib/providers/spondSync'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const { user, authError } = await createUserServerClient()
    if (!user) return NextResponse.json({ ok: false, error: authError ?? 'unauthorized' }, { status: 401 })

    const supabase = createAdminSupabase()
    const { data, error } = await supabase
      .from('user_connected_providers')
      .select('provider, status, last_sync_at, error_message, updated_at')
      .eq('user_id', user.id)
      .eq('provider', 'spond')
      .maybeSingle()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      connected: data?.status === 'connected' || data?.status === 'error',
      status: data?.status ?? 'disconnected',
      last_sync_at: data?.last_sync_at ?? null,
      error_message: data?.error_message ?? null,
      updated_at: data?.updated_at ?? null,
      provider_enabled: String(process.env.SPOND_PROVIDER_ENABLED ?? 'true').toLowerCase() !== 'false',
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
