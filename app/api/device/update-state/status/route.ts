import { NextResponse } from 'next/server'
import { authenticateUserForDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  const deviceId = deviceIdFrom(new URL(req.url).searchParams.get('device_id'))
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })

  const auth = await authenticateUserForDevice(req, deviceId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.supabase
    .from('device_update_state')
    .select('requested_revision, requested_at, displayed_revision, last_displayed_at')
    .eq('device_id', deviceId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'internal_error' }, { status: 500 })

  return NextResponse.json(
    {
      requested_revision: data?.requested_revision ?? 0,
      requested_at: data?.requested_at ?? null,
      displayed_revision: data?.displayed_revision ?? 0,
      last_displayed_at: data?.last_displayed_at ?? null,
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
  )
}
