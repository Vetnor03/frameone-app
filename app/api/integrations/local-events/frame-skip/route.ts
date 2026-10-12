import { localEventGroupKeyFromRaw, groupSkipId } from '@/app/lib/integrations/local-events/grouping'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const deviceId = String(body?.deviceId || body?.device_id || '').trim()
  let externalEventId = String(body?.externalEventId || body?.external_event_id || '').trim()
  const wholeGroup = body?.scope === 'group'
  const skipped = body?.skipped === true
  const provider = 'edge-of-norway'

  if (!deviceId) return NextResponse.json({ error: 'Missing deviceId' }, { status: 400 })
  if (!externalEventId) return NextResponse.json({ error: 'Missing externalEventId' }, { status: 400 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const member = await supabase
    .from('device_members')
    .select('role')
    .eq('device_id', deviceId)
    .eq('user_id', userId)
    .maybeSingle()

  if (member.error) return NextResponse.json({ error: member.error.message }, { status: 500 })
  if (!member.data) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (wholeGroup) {
    // Derive the group key from a real event on this device, never from client input.
    const { data: event, error: eventError } = await supabase.from('integration_items')
      .select('title,raw').eq('device_id', deviceId).eq('provider', provider)
      .eq('external_id', externalEventId).maybeSingle()
    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    const key = localEventGroupKeyFromRaw(event)
    if (!key) return NextResponse.json({ error: 'Invalid event group' }, { status: 400 })
    externalEventId = groupSkipId(key)
  }

  if (!skipped) {
    const deleted = await supabase
      .from('local_event_frame_skips')
      .delete()
      .eq('device_id', deviceId)
      .eq('provider', provider)
      .eq('external_event_id', externalEventId)
    if (deleted.error) return NextResponse.json({ error: deleted.error.message }, { status: 500 })
    return NextResponse.json({ ok: true, skipped: false })
  }

  const saved = await supabase
    .from('local_event_frame_skips')
    .upsert({ device_id: deviceId, provider, external_event_id: externalEventId, skipped: true, updated_by: userId }, { onConflict: 'device_id,provider,external_event_id' })
    .select('skipped')
    .maybeSingle()

  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 })
  return NextResponse.json({ ok: true, skipped: true })
}
