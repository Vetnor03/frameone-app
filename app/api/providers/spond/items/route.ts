import { NextResponse } from 'next/server'
import { createUserServerClient } from '../../../../lib/serverAuth'
import { createAdminSupabase } from '../../../../lib/providers/spondSync'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const { user, authError } = await createUserServerClient()
    if (!user) return NextResponse.json({ ok: false, error: authError ?? 'unauthorized' }, { status: 401 })

    const now = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const supabase = createAdminSupabase()
    const { data, error } = await supabase
      .from('external_reminder_items')
      .select('id, provider, external_id, title, text, due_at, source_metadata, dismissed_at, updated_at')
      .eq('user_id', user.id)
      .eq('provider', 'spond')
      .is('dismissed_at', null)
      .gte('due_at', now)
      .order('due_at', { ascending: true })
      .limit(20)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, items: data ?? [] })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
