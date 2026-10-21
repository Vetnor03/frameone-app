import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  limitedPilotMattes,
  pilotFrameNames,
  pilotMatteNames,
  validPilotFrame,
  validPilotInvitation,
  validPilotMatte,
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
    .select('full_name,email')
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

  const { data: order, error: orderError } = await db
    .from('pilot_orders')
    .select('frame_id,matte_id,status')
    .eq('email', applicant.email)
    .maybeSingle()
  if (orderError) {
    console.error('[pilot-orders] Unable to read existing selection.', { code: orderError.code })
    return NextResponse.json({ error: 'Could not check your selection.' }, { status: 503, headers: noStore })
  }

  return NextResponse.json({
    fullName: applicant.full_name,
    email: applicant.email,
    frameId: validPilotFrame(order?.frame_id) ? order.frame_id : null,
    matteId: validPilotMatte(order?.matte_id) ? order.matte_id : null,
    orderStatus: order?.status || null,
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

  const addressLine1 = readField(body.addressLine1, 160)
  const addressLine2 = readField(body.addressLine2, 160) || null
  const postalCode = readField(body.postalCode, 16)
  const city = readField(body.city, 100)
  const country = readField(body.country, 80)
  const frameId = body.frameId
  const matteId = body.matteId

  if (!addressLine1 || !postalCode || !city || !country || !validPilotFrame(frameId) || !validPilotMatte(matteId)) {
    return NextResponse.json({ error: 'Please complete the address and select one frame and one matte.' }, { status: 400, headers: noStore })
  }

  const db = pilotDatabase()
  if (!db) {
    return NextResponse.json({ error: 'Pilot selection is currently unavailable.' }, { status: 503, headers: noStore })
  }

  // The invitation is the application's random UUID, not an email address:
  // only explicitly selected applicants can submit or edit their own selection.
  const { data: applicant, error: applicantError } = await db
    .from('pilot_applications')
    .select('full_name,email')
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

  // A fulfilled or confirmed loan must never be silently reset to 'submitted'.
  const { data: existingOrder, error: lookupError } = await db
    .from('pilot_orders')
    .select('status')
    .eq('email', applicant.email)
    .maybeSingle()
  if (lookupError) {
    console.error('[pilot-orders] Unable to check existing order.', { code: lookupError.code })
    return NextResponse.json({ error: 'Could not save your selection.' }, { status: 503, headers: noStore })
  }
  if (existingOrder && existingOrder.status !== 'submitted') {
    return NextResponse.json({ error: 'This pilot selection has already been confirmed. Contact RE:MIND if you need to change it.' }, { status: 409, headers: noStore })
  }

  const { error } = await db
    .from('pilot_orders')
    .upsert({
      full_name: applicant.full_name,
      email: applicant.email,
      shipping_address_line1: addressLine1,
      shipping_address_line2: addressLine2,
      shipping_postal_code: postalCode,
      shipping_city: city,
      shipping_country: country,
      frame_id: frameId,
      frame_name: pilotFrameNames[frameId],
      matte_id: matteId,
      matte_name: pilotMatteNames[matteId],
      matte_limited_edition: limitedPilotMattes.has(matteId),
      status: 'submitted',
      source: 'selected-pilot-invitation',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' })

  if (error) {
    console.error('[pilot-orders] Unable to save invited order.', { code: error.code, message: error.message })
    return NextResponse.json({ error: 'Could not save your selection. Please try again.' }, { status: 500, headers: noStore })
  }

  return NextResponse.json({ ok: true }, { headers: noStore })
}
