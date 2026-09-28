import { NextResponse } from 'next/server'
import { legacyPairingQuarantined } from '@/app/lib/device/pairingRollout'

export const runtime = 'nodejs'

// Deliberately disabled: this slice introduces no provisioning, claim, session,
// proof or credential issuer. The staging schema must never become a remote
// enrollment API merely because a table exists.
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
