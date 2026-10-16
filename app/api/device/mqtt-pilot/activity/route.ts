import { NextResponse } from 'next/server'
import { authenticateUserForDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { publishPilotActivity } from '@/app/lib/device/mqttPilotPublish'
import { mqttEnabledForDevice } from '@/app/lib/device/mqttRollout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// This is a best-effort hint, not a persisted presence tracker. A background
// tab sends nothing, and the frame expires the hint itself after 120 seconds.
// The device must belong to an authenticated user. Only the explicitly
// allowlisted pilot device is eligible for a broker publish.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { device_id?: unknown } | null
  const deviceId = deviceIdFrom(body?.device_id)
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })

  // No broker calls and no new DB work when the experiment is switched off.
  if (!mqttEnabledForDevice(deviceId)) {
    return NextResponse.json({ enabled: false }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const auth = await authenticateUserForDevice(req, deviceId)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const result = await publishPilotActivity(deviceId)
  // Presence is deliberately best-effort: failures do not block app editing
  // or the existing durable manual Update action.
  return NextResponse.json({ enabled: true, delivered: result === 'published' }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
