import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  limitedPilotMattes,
  pilotFrameNames,
  pilotMatteNames,
  validPilotFrame,
  validPilotInvitation,
  validSelectablePilotMatte,
} from '@/app/lib/pilotSelection'

export const dynamic = 'force-dynamic'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const noStore = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }

function readField(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.length <= maxLength ? value.trim() : ''
}

function pilotDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
}

export async function GET(request: Request) {
  const invite = new URL(request.url).searchParams.get('invite')
  if (!validPilotInvitation(invite)) {
    return NextResponse.json({ error: 'This invitation link is invalid.' }, { status: 404, headers: noStore })
  }

  const db = pilotDatabase()
  if (!db) {
    return NextResponse.json({ error: 'Pilot selection is currently unavailable.' }, { status: 503, headers: noStore })
  }

  const { data: applicant, error: applicantError } = await db
    .from('pilot_applications')
    .select('id,full_name,email')
    .eq('id', invite)
    .eq('status', 'selected')
    .maybeSingle()

  if (applicantError) {
    console.error('[pilot-orders] Unable to check selected invitation.', { code: applicantError.code })
    return NextResponse.json({ error: 'Could not check your invitation.' }, { status: 503, headers: noStore })
  }
  if (!applicant) {
    return NextResponse.json({ error: 'This invitation is not active.' }, { status: 404, headers: noStore })
  }

  const { data: confirmation, error: confirmationError } = await db
    .from('pilot_confirmations')
    .select('full_name')
    .eq('application_id', invite)
    .maybeSingle()
  if (confirmationError) {
    console.error('[pilot-orders] Unable to verify loan confirmation.', { code: confirmationError.code })
    return NextResponse.json({ error: 'Could not check your participation.' }, { status: 503, headers: noStore })
  }
  if (!confirmation) {
    return NextResponse.json({ error: 'Bekreft deltakelsen før du velger ramme.' }, { status: 403, headers: noStore })
  }

  // Invitation links are bearer links and must stop working after the first save.
  // Never send saved order details to someone replaying an invitation URL.
  const { data: order, error: orderError } = await db
    .from('pilot_orders')
    .select('id')
    .eq('email', applicant.email)
    .maybeSingle()
  if (orderError) {
    console.error('[pilot-orders] Unable to check existing selection.', { code: orderError.code })
    return NextResponse.json({ error: 'Could not check your selection.' }, { status: 503, headers: noStore })
  }
  if (order) {
    return NextResponse.json(
      { error: 'Valget ditt er allerede registrert. Denne lenken kan ikke brukes igjen.', used: true },
      { status: 410, headers: noStore },
    )
  }

  return NextResponse.json({
    fullName: confirmation.full_name,
    email: applicant.email,
    frameId: null,
    matteId: null,
    orderStatus: null,
  }, { headers: noStore })
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403, headers: noStore })
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 415, headers: noStore })
  }

  const raw = await request.text()
  if (raw.length > 6000) {
    return NextResponse.json({ error: 'Invalid selection.' }, { status: 413, headers: noStore })
  }

  let body: Record<string, unknown>
  try {
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid')
    body = data as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid selection.' }, { status: 400, headers: noStore })
  }

  // Honeypot: do not send bot submissions to our database.
  if (readField(body.website, 200)) return NextResponse.json({ ok: true }, { headers: noStore })

  const invite = body.invite
  if (!validPilotInvitation(invite)) {
    return NextResponse.json({ error: 'Please use your personal invitation link.' }, { status: 403, headers: noStore })
  }

  const frameId = body.frameId
  const matteId = body.matteId

  if (!validPilotFrame(frameId) || !validSelectablePilotMatte(matteId)) {
    return NextResponse.json({ error: 'Please select one frame and one matte.' }, { status: 400, headers: noStore })
  }

  const db = pilotDatabase()
  if (!db) {
    return NextResponse.json({ error: 'Pilot selection is currently unavailable.' }, { status: 503, headers: noStore })
  }

  // The invitation is the application's random UUID, not an email address:
  // only selected applicants can submit a one-time selection.
  const { data: applicant, error: applicantError } = await db
    .from('pilot_applications')
    .select('id,full_name,email')
    .eq('id', invite)
    .eq('status', 'selected')
    .maybeSingle()
  if (applicantError) {
    console.error('[pilot-orders] Unable to verify invitation.', { code: applicantError.code })
    return NextResponse.json({ error: 'Could not verify your invitation.' }, { status: 503, headers: noStore })
  }
  if (!applicant || !emailPattern.test(applicant.email)) {
    return NextResponse.json({ error: 'This invitation is not active.' }, { status: 403, headers: noStore })
  }

  // The loan terms and delivery address are confirmed in the previous step.
  // Read them only from the private, immutable server-side confirmation.
  const { data: confirmation, error: confirmationError } = await db
    .from('pilot_confirmations')
    .select('full_name,shipping_address_line1,shipping_address_line2,shipping_postal_code,shipping_city,shipping_country')
    .eq('application_id', applicant.id)
    .maybeSingle()
  if (confirmationError) {
    console.error('[pilot-orders] Unable to verify loan confirmation.', { code: confirmationError.code })
    return NextResponse.json({ error: 'Could not verify your participation.' }, { status: 503, headers: noStore })
  }
  if (!confirmation) {
    return NextResponse.json({ error: 'Bekreft deltakelsen før du velger ramme.' }, { status: 403, headers: noStore })
  }

  // Any previously saved order consumes this link, regardless of order status.
  const { data: existingOrder, error: lookupError } = await db
    .from('pilot_orders')
    .select('id')
    .eq('email', applicant.email)
    .maybeSingle()
  if (lookupError) {
    console.error('[pilot-orders] Unable to check existing order.', { code: lookupError.code })
    return NextResponse.json({ error: 'Could not save your selection.' }, { status: 503, headers: noStore })
  }
  if (existingOrder) {
    return NextResponse.json(
      { error: 'Valget ditt er allerede registrert. Lenken kan ikke brukes igjen.', used: true },
      { status: 409, headers: noStore },
    )
  }

  // Insert rather than upsert: the existing UNIQUE(email) database constraint
  // atomically rejects a second submission, even from two concurrent requests.
  const { error } = await db
    .from('pilot_orders')
    .insert({
      full_name: confirmation.full_name,
      email: applicant.email,
      shipping_address_line1: confirmation.shipping_address_line1,
      shipping_address_line2: confirmation.shipping_address_line2,
      shipping_postal_code: confirmation.shipping_postal_code,
      shipping_city: confirmation.shipping_city,
      shipping_country: confirmation.shipping_country,
      frame_id: frameId,
      frame_name: pilotFrameNames[frameId],
      matte_id: matteId,
      matte_name: pilotMatteNames[matteId],
      matte_limited_edition: limitedPilotMattes.has(matteId),
      status: 'submitted',
      source: 'selected-pilot-invitation',
      updated_at: new Date().toISOString(),
    })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Valget ditt er allerede registrert. Lenken kan ikke brukes igjen.', used: true },
        { status: 409, headers: noStore },
      )
    }
    console.error('[pilot-orders] Unable to save invited order.', { code: error.code, message: error.message })
    return NextResponse.json({ error: 'Could not save your selection. Please try again.' }, { status: 500, headers: noStore })
  }

  return NextResponse.json({ ok: true }, { headers: noStore })
}
