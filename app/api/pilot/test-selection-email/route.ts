import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  validPilotFrame,
  validSelectablePilotMatte,
} from '@/app/lib/pilotSelection'
import { sendPilotSelectionConfirmationEmail } from '@/app/lib/pilotSelectionConfirmationEmail'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }

// Short-lived founder-only preview. No public demo visitor can trigger an email.
// Do not enable in production; recipient is fixed and never accepted from the browser.
const EXPIRES_AT = Date.parse('2026-11-10T00:00:00Z')
const TEST_RECIPIENT = 'vetlecn@live.no'

function sameSecret(candidate: unknown, expected: string) {
  if (typeof candidate !== 'string' || candidate.length > 256) return false
  const one = Buffer.from(candidate)
  const two = Buffer.from(expected)
  return one.length === two.length && timingSafeEqual(one, two)
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview' || Date.now() >= EXPIRES_AT) {
    return NextResponse.json({ error: 'Test email is unavailable.' }, { status: 404, headers: noStore })
  }

  const secret = process.env.PILOT_SELECTION_EMAIL_TEST_SECRET
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: 'Test email is unavailable.' }, { status: 404, headers: noStore })
  }
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403, headers: noStore })
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 415, headers: noStore })
  }
  const raw = await request.text()
  if (raw.length > 1500) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 413, headers: noStore })
  }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { /* checked below */ }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: noStore })
  }
  const body = parsed as Record<string, unknown>
  if (!sameSecret(body.testKey, secret)) {
    return NextResponse.json({ error: 'Invalid test link.' }, { status: 403, headers: noStore })
  }
  if (!validPilotFrame(body.frameId) || !validSelectablePilotMatte(body.matteId)) {
    return NextResponse.json({ error: 'Invalid frame or passepartout.' }, { status: 400, headers: noStore })
  }

  // Resend deduplicates repeated clicks for the same combination within 24h.
  const result = await sendPilotSelectionConfirmationEmail({
    fullName: 'Vetle',
    email: TEST_RECIPIENT,
    frameId: body.frameId,
    matteId: body.matteId,
    testMode: true,
    idempotencyKey: 'pilot-selection-preview/' + body.frameId + '/' + body.matteId,
  })
  if (!result.sent) {
    return NextResponse.json({ error: 'Kunne ikke sende test-e-post. Prøv igjen.' }, { status: 502, headers: noStore })
  }
  return NextResponse.json({ ok: true, sentTo: TEST_RECIPIENT }, { headers: noStore })
}
