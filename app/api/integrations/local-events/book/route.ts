import { NextResponse } from 'next/server'
import { getAuthenticatedUserId, getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { requireLocalEventsFrameMember } from '@/app/lib/integrations/local-events/server'
import { localEventGroupKeyFromRaw } from '@/app/lib/integrations/local-events/grouping'

export const runtime = 'nodejs'

const oslo = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function localStart(iso: string) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return null
  const parts = Object.fromEntries(oslo.formatToParts(date).map(p => [p.type, p.value]))
  return { date: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute }
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
  const externalEventId = typeof body?.externalEventId === 'string' ? body.externalEventId.trim() : ''
  if (!deviceId || !externalEventId || deviceId.length > 100 || externalEventId.length > 512) {
    return NextResponse.json({ error: 'Missing or invalid event' }, { status: 400 })
  }

  try {
    await requireLocalEventsFrameMember(userId, deviceId, true)
    const supabase = getSupabaseAdmin()
    // Never trust a client-supplied title, date, URL or group key when booking.
    const { data: event, error } = await supabase.from('integration_items')
      .select('title,starts_at,external_id,raw')
      .eq('device_id', deviceId).eq('provider', 'edge-of-norway')
      .eq('external_id', externalEventId).maybeSingle()
    if (error) throw error
    if (!event) return NextResponse.json({ error: 'Event is no longer available' }, { status: 404 })
    const groupKey = localEventGroupKeyFromRaw(event)
    const startsAt = String(event.starts_at || '')
    const startMs = Date.parse(startsAt)
    const start = localStart(startsAt)
    const title = String((event.raw as Record<string, unknown> | null)?.title || event.title || '').trim()
    if (!groupKey || !start || !title || !Number.isFinite(startMs) || startMs <= Date.now()) {
      return NextResponse.json({ error: 'Only future events can be marked as booked' }, { status: 400 })
    }
    const eventUrl = (event.raw as Record<string, unknown> | null)?.sourceUrl
    const sourceUrl = typeof eventUrl === 'string' && /^https:\/\//i.test(eventUrl) ? eventUrl : null

    const { data: existing, error: existingError } = await supabase.from('reminders')
      .select('id').eq('device_id', deviceId)
      .eq('source_event_group_key', groupKey).eq('is_done', false).maybeSingle()
    if (existingError) throw existingError
    if (existing) return NextResponse.json({ ok: true, alreadyBooked: true, reminderId: existing.id })

    const { data: created, error: insertError } = await supabase.from('reminders')
      .insert({
        device_id: deviceId,
        created_by_user_id: userId,
        updated_by_user_id: userId,
        title: 'Bestilt: ' + title,
        due_date: start.date,
        due_time: start.time,
        tag: 'event',
        repeat_type: 'none',
        is_done: false,
        source_event_group_key: groupKey,
        source_event_external_id: externalEventId,
        source_event_url: sourceUrl,
      }).select('id').single()
    if (insertError) {
      if (insertError.code === '23505') return NextResponse.json({ ok: true, alreadyBooked: true })
      throw insertError
    }
    return NextResponse.json({ ok: true, reminderId: created.id, bookedDate: start.date })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not book event'
    if (/forbidden|permission/i.test(message)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    console.error('[local-events] Mark as booked failed', { reason: message })
    return NextResponse.json({ error: 'Could not save booked event' }, { status: 500 })
  }
}
