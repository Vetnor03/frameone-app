import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// 🔧 Change this when you deploy a new firmware
const LATEST_VERSION = 'v2.3.0'

// 🔧 Where your .bin is hosted
const FIRMWARE_BASE_URL = 'https://re-mind.no/firmware'

function isNewer(current: string | null, latest: string) {
  if (!current) return true

  const parse = (v: string) =>
    v.replace(/^v/, '').split('.').map((n) => parseInt(n || '0', 10))

  const [cMaj, cMin, cPat] = parse(current)
  const [lMaj, lMin, lPat] = parse(latest)

  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPat > cPat
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const deviceId = searchParams.get('device_id')
  const currentVersion = searchParams.get('current_version')

  // (optional) you can validate device here

  const updateAvailable = isNewer(currentVersion, LATEST_VERSION)

  return NextResponse.json({
    latest_version: LATEST_VERSION,
    update_available: updateAvailable,
    url: `${FIRMWARE_BASE_URL}/frame-${LATEST_VERSION.replace('v', '')}.bin`,
  })
}
