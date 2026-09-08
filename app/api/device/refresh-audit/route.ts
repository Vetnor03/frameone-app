import { NextResponse } from 'next/server'
import { authenticatePhysicalDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { TEMP_REFRESH_AUDIT_ENABLED, TEMP_REFRESH_AUDIT_prepareBatch } from '@/app/lib/device/tempRefreshAudit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// TEMP_REFRESH_AUDIT: authenticated, bounded batch ingestion. This deliberately
// reuses physical device tokens and exposes no anonymous/client table writes.
export async function POST(req: Request) {
  if (!TEMP_REFRESH_AUDIT_ENABLED) return NextResponse.json({ disabled: true }, { status: 404 })
  const body = await req.json().catch(() => null) as { device_id?: unknown, records?: unknown } | null
  const deviceId = deviceIdFrom(body?.device_id)
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })
  const auth = await authenticatePhysicalDevice(req, deviceId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const recordsInput = body?.records
  if (!Array.isArray(recordsInput) || recordsInput.length < 1 || recordsInput.length > 8) {
    return NextResponse.json({ error: 'invalid_batch' }, { status: 400 })
  }
  const batch = TEMP_REFRESH_AUDIT_prepareBatch(recordsInput, true)
  if (batch.error) return NextResponse.json({ error: batch.error }, { status: 400 })
  // TEMP_REFRESH_AUDIT: upsert + unique(device_id,event_seq) makes a resend after
  // a lost response idempotent while preserving the originally received row.
  const { error } = await auth.supabase.from('temp_refresh_audit_logs').upsert(
    batch.records.map((record) => ({ ...record, device_id: deviceId })),
    { onConflict: 'device_id,event_seq', ignoreDuplicates: true },
  )
  if (error) return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  return NextResponse.json({ accepted: batch.records.length })
}
