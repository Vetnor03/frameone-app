import { NextResponse } from 'next/server'
import { createUserServerClient } from '../../../../lib/serverAuth'
import { createAdminSupabase } from '../../../../lib/providers/spondSync'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const { user, authError } = await createUserServerClient()
    if (!user) return NextResponse.json({ ok: false, error: authError ?? 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const externalId = String(body?.external_id ?? '').trim()
    if (!externalId) return NextResponse.json({ ok: false, error: 'Missing external_id' }, { status: 400 })

    const supabase = createAdminSupabase()
    const { error } = await supabase
      .from('external_reminder_items')
      .update({ dismissed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('provider', 'spond')
      .eq('external_id', externalId)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
