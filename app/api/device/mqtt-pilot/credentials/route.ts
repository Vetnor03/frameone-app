import { NextResponse } from 'next/server'
import { authenticatePhysicalDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { pilotCredentialPayload } from '@/app/lib/device/mqttPilotCredentials'
import { ablyCanaryForDevice, mqttEnabledForDevice } from '@/app/lib/device/mqttRollout'
import { provisionFrameMqtt } from '@/app/lib/device/mqttFleetProvisioning'
import { ABLY_MQTT_HOST, ABLY_MQTT_PORT, makeAblyFrameCredentials } from '@/app/lib/device/mqttAbly'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }

function brokerConnectionDetails(fleet: boolean) {
  // Never return the Serverless pilot host when issuing Dedicated fleet credentials.
  const host = fleet ? process.env.MQTT_FLEET_BROKER_HOST :
    (process.env.MQTT_BROKER_HOST || 'i5138504.ala.us-east-1.emqxsl.com')
  const rawPort = fleet ? process.env.MQTT_FLEET_BROKER_PORT :
    (process.env.MQTT_BROKER_PORT || '8883')
  if (!host || !rawPort) return null
  const port = Number(rawPort)
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(host) ||
      !Number.isInteger(port) || port < 1 || port > 65535) return null
  // Public root PEM may be provided by the trusted backend when the broker
  // moves to a different CA. No firmware reflash is needed for a CA rotation.
  // The ESP32 authenticates this payload over the existing trusted HTTPS
  // connection and still performs real TLS hostname verification to MQTT.
  const rootCa = fleet ? process.env.MQTT_FLEET_BROKER_ROOT_CA_PEM :
    process.env.MQTT_BROKER_ROOT_CA_PEM
  if (rootCa && (rootCa.length > 4096 ||
      !rootCa.includes('-----BEGIN CERTIFICATE-----') ||
      !rootCa.includes('-----END CERTIFICATE-----'))) return null
  return {
    broker_host: host,
    broker_port: port,
    ...(rootCa ? { broker_ca_pem: rootCa } : {}),
  }
}

// A physical frame's own HTTP device token is required (never browser JWT).
// Credentials are created on demand only after pairing and authentication.
// The unverified or unsupported broker path fails safely and never leaks a key.
export async function GET(req: Request) {
  const deviceId = deviceIdFrom(new URL(req.url).searchParams.get('device_id'))
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400, headers: NO_STORE })
  if (!mqttEnabledForDevice(deviceId)) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404, headers: NO_STORE })
  }
  const auth = await authenticatePhysicalDevice(req, deviceId)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE })
  }

  // Preserve the manually configured prototype's original authenticated
  // credentials path. This is deliberately checked before the new fleet-only
  // pairing gate so the pilot can't regress during backend migration.
  const pilot = pilotCredentialPayload(deviceId)
  if (pilot) {
    const connection = brokerConnectionDetails(false)
    if (!connection) return NextResponse.json({ error: 'broker_not_configured' }, { status: 503, headers: NO_STORE })
    return NextResponse.json({ ...pilot, ...connection }, { headers: NO_STORE })
  }

  // Only paired frames get a broker account, preventing a factory/shelf-mode
  // device from provisioning itself before a user actually claims it.
  const { data: members, error: memberError } = await auth.supabase
    .from('device_members')
    .select('device_id')
    .eq('device_id', deviceId)
    .limit(1)
  if (memberError) return NextResponse.json({ error: 'backend_unavailable' }, { status: 503, headers: NO_STORE })
  if (!members?.length) return NextResponse.json({ error: 'not_paired' }, { status: 403, headers: NO_STORE })

  // The one-frame Ably canary can be activated without enabling all paired
  // frames. It still requires the real physical-device token and pairing.
  // Fleet rollout remains independently disabled until validation.
  const ablyCanary = ablyCanaryForDevice(deviceId, {
    ablyCanaryEnabled: process.env.MQTT_ABLY_CANARY_ENABLED,
    ablyCanaryDeviceId: process.env.MQTT_ABLY_CANARY_DEVICE_ID,
    ablyApiKey: process.env.MQTT_ABLY_API_KEY,
    ablyRootCaPem: process.env.MQTT_ABLY_ROOT_CA_PEM,
  })
  if (!ablyCanary && process.env.MQTT_FLEET_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404, headers: NO_STORE })
  }
  if (ablyCanary || process.env.MQTT_FLEET_PROVIDER === 'ably_jwt_v1') {
    // A channel-scoped, short-lived JWT replaces broker-side account creation.
    // Firmware will supply the JWT as its MQTT username, never the device token.
    const credentials = makeAblyFrameCredentials(deviceId, process.env.MQTT_ABLY_API_KEY)
    const publicCa = process.env.MQTT_ABLY_ROOT_CA_PEM
    if (!credentials || !publicCa || publicCa.length > 4096 ||
        !publicCa.includes('-----BEGIN CERTIFICATE-----') ||
        !publicCa.includes('-----END CERTIFICATE-----')) {
      return NextResponse.json({ error: 'broker_not_configured' }, { status: 503, headers: NO_STORE })
    }
    return NextResponse.json({ ...credentials, broker_host: ABLY_MQTT_HOST,
      broker_port: ABLY_MQTT_PORT, broker_ca_pem: publicCa }, { headers: NO_STORE })
  }

  const connection = brokerConnectionDetails(true)
  if (!connection) return NextResponse.json({ error: 'broker_not_configured' }, { status: 503, headers: NO_STORE })
  const provision = await provisionFrameMqtt(deviceId)
  if (!provision.ok) {
    console.warn('[mqtt-credentials] fleet provisioning deferred', { device_id: deviceId, reason: provision.reason })
    return NextResponse.json({ error: 'broker_unavailable' }, { status: 503, headers: NO_STORE })
  }
  return NextResponse.json({ username: provision.username, password: provision.password, ...connection }, {
    headers: NO_STORE,
  })
}
