import { NextResponse } from 'next/server'
import { createUserServerClient } from '../../../../lib/serverAuth'
import { createAdminSupabase } from '../../../../lib/providers/spondSync'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const { user, authError } = await createUserServerClient()
    if (!user) return NextResponse.json({ ok: false, error: authError ?? 'unauthorized' }, { status: 401 })

    const supabase = createAdminSupabase()
    const [{ error: itemError }, { error: providerError }] = await Promise.all([
      supabase.from('external_reminder_items').delete().eq('user_id', user.id).eq('provider', 'spond'),
      supabase.from('user_connected_providers').delete().eq('user_id', user.id).eq('provider', 'spond'),
    ])

    if (itemError || providerError) {
      return NextResponse.json({ ok: false, error: itemError?.message ?? providerError?.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, status: 'disconnected' })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
