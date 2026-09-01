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

  const probedAt = new Date().toISOString()
  const { error: probeError } = await auth.supabase
    .from('device_update_state')
    .update({ last_probe_at: probedAt })
    .eq('device_id', deviceId)
  if (probeError) return NextResponse.json({ error: 'internal_error' }, { status: 500 })

  const { data, error } = await auth.supabase
    .from('device_update_state')
    .select('requested_revision, displayed_revision')
    .eq('device_id', deviceId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'internal_error' }, { status: 500 })

  return NextResponse.json(
    {
      requested_revision: data?.requested_revision ?? 0,
      displayed_revision: data?.displayed_revision ?? 0,
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
  )
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { device_id?: unknown; displayed_revision?: unknown } | null
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
  return NextResponse.json({ displayed_revision: data })
}
