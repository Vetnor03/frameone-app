import { NextResponse } from 'next/server'
import { authenticateUserForDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { publishPilotActivity } from '@/app/lib/device/mqttPilotPublish'
import { ablyAutoConfigured, mqttEnabledForDevice } from '@/app/lib/device/mqttRollout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// This is a best-effort hint, not a persisted presence tracker. A background
// tab sends nothing, and the frame expires the hint itself after 75 seconds.
// The device must belong to an authenticated user. Only the explicitly
// allowlisted pilot frames are eligible for a broker publish.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { device_id?: unknown } | null
  const deviceId = deviceIdFrom(body?.device_id)
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })

  // No broker calls and no new DB work when the experiment is switched off.
  if (!mqttEnabledForDevice(deviceId) && !ablyAutoConfigured({
    ablyAutoEnabled: process.env.MQTT_ABLY_AUTO_ENABLED,
    ablyAutoPairedSince: process.env.MQTT_ABLY_AUTO_PAIRED_SINCE,
    fleetProvider: process.env.MQTT_FLEET_PROVIDER,
    ablyApiKey: process.env.MQTT_ABLY_API_KEY,
    ablyRootCaPem: process.env.MQTT_ABLY_ROOT_CA_PEM,
  })) {
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
  return NextResponse.json({ enabled: result !== 'disabled', delivered: result === 'published' }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
