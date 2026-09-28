import { NextResponse } from 'next/server'
import { legacyPairingQuarantined } from '@/app/lib/device/pairingRollout'

export const runtime = 'nodejs'

// Deliberately disabled until physical enrollment, v2-only auth across all
// firmware endpoints, trusted device ingress and key management are accepted.
// Never parse caller-provided credentials or instantiate a service client.
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
