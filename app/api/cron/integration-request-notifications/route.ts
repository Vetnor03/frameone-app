import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { sendIntegrationRequestNotification, type IntegrationRequestForNotification } from '@/app/lib/integrations/requestNotification'

export const runtime = 'nodejs'

// Retry pending notifications privately once a day. Requests are always stored
// first, so temporary mail provider outages cannot erase user suggestions.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('integration_requests')
    .select('id, app_name, note, created_at')
    .is('notification_sent_at', null)
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) {
    console.error('[integration-requests] Could not load pending notifications.', { code: error.code })
    return NextResponse.json({ error: 'Notification queue unavailable' }, { status: 503 })
  }

  let sent = 0
  let failed = 0
  for (const item of (data || []) as IntegrationRequestForNotification[]) {
    const delivered = await sendIntegrationRequestNotification(item)
    if (!delivered) {
      failed++
      continue
    }
    const { error: updateError } = await db
      .from('integration_requests')
      .update({ notification_sent_at: new Date().toISOString() })
      .eq('id', item.id)
      .is('notification_sent_at', null)

    if (updateError) {
      failed++
      console.error('[integration-requests] Could not record notification delivery.', { requestId: item.id, code: updateError.code })
    } else {
      sent++
    }
  }

  return NextResponse.json({ ok: failed === 0, processed: (data || []).length, sent, failed }, {
    status: failed === 0 ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
