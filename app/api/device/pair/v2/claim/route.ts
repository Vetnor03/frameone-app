import { NextResponse } from 'next/server'
import { legacyPairingQuarantined } from '@/app/lib/device/pairingRollout'

export const runtime = 'nodejs'

// Deliberately disabled until verified physical provisioning, trusted ingress,
// rate-limit/HMAC secrets and end-to-end device acceptance are in place.
// No request parsing, service-role client or credential issuance.
const PAIRING_V2_ENABLED = false as const

export async function POST() {
  if (!legacyPairingQuarantined()) {
    return NextResponse.json({ error: 'not_found' }, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  if (!PAIRING_V2_ENABLED) {
    return NextResponse.json({ error: 'pairing_v2_not_enabled' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
