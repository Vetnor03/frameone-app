import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const LATEST_VERSION = 'v2.3.2'
const FIRMWARE_BASE_URL = 'https://re-mind.no/firmware'

function parseVersion(v: string): [number, number, number] {
  const cleaned = v.trim().replace(/^v/i, '')
  const parts = cleaned.split('.')

  return [
    parseInt(parts[0] || '0', 10),
    parseInt(parts[1] || '0', 10),
    parseInt(parts[2] || '0', 10),
  ]
}

function isNewer(current: string | null, latest: string): boolean {
  if (!current || !current.trim()) return true

  const [cMaj, cMin, cPat] = parseVersion(current)
  const [lMaj, lMin, lPat] = parseVersion(latest)

  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPat > cPat
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const deviceId = searchParams.get('device_id')
  const currentVersion = searchParams.get('current_version')

  const updateAvailable = isNewer(currentVersion, LATEST_VERSION)

  return NextResponse.json({
    latest_version: LATEST_VERSION,
    update_available: updateAvailable,
    url: `${FIRMWARE_BASE_URL}/frame-${LATEST_VERSION.replace(/^v/i, '')}.bin`,
    device_id: deviceId,
    current_version: currentVersion,
  })
}
