import { NextResponse } from 'next/server'
import { authenticatePhysicalDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  const deviceId = deviceIdFrom(new URL(req.url).searchParams.get('device_id'))
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })

  const auth = await authenticatePhysicalDevice(req, deviceId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.supabase
    .from('device_update_state')
    .select('requested_revision, displayed_revision')
    .eq('device_id', deviceId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'internal_error' }, { status: 500 })

  const requestedRevision = data?.requested_revision ?? 0
  const displayedRevision = data?.displayed_revision ?? 0
  if (!Number.isSafeInteger(requestedRevision) || requestedRevision < 0 ||
      !Number.isSafeInteger(displayedRevision) || displayedRevision < 0 ||
      displayedRevision > requestedRevision) {
    return NextResponse.json({ error: 'invalid_revision_state' }, { status: 500 })
  }

  return NextResponse.json(
    {
      requested_revision: requestedRevision,
      displayed_revision: displayedRevision,
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
  )
}

// The physical frame can piggyback one small timing snapshot on the normal ACK.
// Only numeric, whitelisted fields are logged; no token, content or titles.
const MANUAL_TIMING_FIELDS = [
  'attempts', 'probe_to_pending_ms', 'updating_screen_ms', 'config_fetch_ms',
  'render_state_fetch_ms', 'reminders_preload_ms', 'news_preload_ms',
  'soccer_preload_ms', 'display_ms', 'render_total_ms', 'post_render_ms',
  'before_ack_ms',
] as const

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    device_id?: unknown; displayed_revision?: unknown; manual_timing?: unknown
  } | null
  const deviceId = deviceIdFrom(body?.device_id)
  const revision = Number(body?.displayed_revision)
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })
  if (!Number.isSafeInteger(revision) || revision < 0) {
    return NextResponse.json({ error: 'invalid_displayed_revision' }, { status: 400 })
  }

  const auth = await authenticatePhysicalDevice(req, deviceId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.supabase.rpc('ack_device_display_revision', {
    p_device_id: deviceId,
    p_displayed_revision: revision,
  })
  if (error?.code === '22023') {
    return NextResponse.json({ error: 'revision_not_requested' }, { status: 409 })
  }
  if (error) return NextResponse.json({ error: 'internal_error' }, { status: 500 })

  // Diagnostics are strictly optional and never affect ACK validation or the
  // physical-display progress state. Vercel logs can be correlated by revision.
  const input = body?.manual_timing
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const record = input as Record<string, unknown>
    const timings: Record<string, number> = {}
    for (const key of MANUAL_TIMING_FIELDS) {
      const value = record[key]
      if (typeof value === 'number' && Number.isSafeInteger(value) &&
          value >= 0 && value <= 3_600_000) timings[key] = value
    }
    if (Object.keys(timings).length >= 4) {
      console.info('[device/update-state] manual-timing', {
        device_id: deviceId, revision: data, ...timings,
      })
    }
  }
  return NextResponse.json({ displayed_revision: data })
}
