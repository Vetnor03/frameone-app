import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { validPilotInvitation } from '@/app/lib/pilotSelection'
import { sendPilotParticipationConfirmation } from '@/app/lib/pilotApplicationEmail'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
const PHONE_MIN_DIGITS = 8
const TERMS_VERSION = '2026-11-04-pilot-loan-v2'

function pilotDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
}

function stringField(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || value.length > maxLength) return null
  return value.trim()
}

export async function GET(request: Request) {
  const invite = new URL(request.url).searchParams.get('invite')
  if (!validPilotInvitation(invite)) {
    return NextResponse.json({ error: 'Bruk den personlige lenken i invitasjonen din.' }, { status: 404, headers: noStore })
  }
  const db = pilotDb()
  if (!db) return NextResponse.json({ error: 'Siden er midlertidig utilgjengelig.' }, { status: 503, headers: noStore })

  const { data: applicant, error } = await db.from('pilot_applications')
    .select('id,full_name,email').eq('id', invite).eq('status', 'selected').maybeSingle()
  if (error) {
    console.error('[pilot-confirm] Failed to verify invitation.', { code: error.code })
    return NextResponse.json({ error: 'Kunne ikke bekrefte invitasjonen.' }, { status: 503, headers: noStore })
  }
  if (!applicant) return NextResponse.json({ error: 'Invitasjonen er ikke aktiv.' }, { status: 404, headers: noStore })

  const { data: existing, error: confirmationError } = await db.from('pilot_confirmations')
    .select('confirmed_at').eq('application_id', applicant.id).maybeSingle()
  if (confirmationError) {
    console.error('[pilot-confirm] Failed to read confirmation.', { code: confirmationError.code })
    return NextResponse.json({ error: 'Kunne ikke sjekke bekreftelsen.' }, { status: 503, headers: noStore })
  }
  return NextResponse.json({
    fullName: applicant.full_name,
    email: applicant.email,
    confirmed: Boolean(existing),
  }, { headers: noStore })
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Ugyldig forespørsel.' }, { status: 403, headers: noStore })
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Forventet JSON.' }, { status: 415, headers: noStore })
  }

  const raw = await request.text()
  if (raw.length > 6000) {
    return NextResponse.json({ error: 'Ugyldig skjema.' }, { status: 413, headers: noStore })
  }
  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Ugyldig skjema.' }, { status: 400, headers: noStore })
  }
  // Hidden anti-bot field; never write it.
  if (stringField(body.website, 200)) return NextResponse.json({ ok: true }, { headers: noStore })

  const invite = body.invite
  const fullName = stringField(body.fullName, 100)
  const phone = stringField(body.phone, 25)
  const addressLine1 = stringField(body.addressLine1, 160)
  const addressLine2 = stringField(body.addressLine2, 160)
  const postalCode = stringField(body.postalCode, 4)
  const city = stringField(body.city, 100)
  const phoneDigits = phone?.replace(/\D/g, '') || ''
  if (!validPilotInvitation(invite) ||
      !fullName || fullName.length < 2 ||
      !phone || !/^[+0-9 ()-]+$/.test(phone) || phoneDigits.length < PHONE_MIN_DIGITS || phoneDigits.length > 15 ||
      !addressLine1 || addressLine1.length < 3 ||
      addressLine2 === null || !postalCode || !/^\d{4}$/.test(postalCode) ||
      !city || city.length < 2 ||
      body.participationAcknowledged !== true ||
      body.loanAcknowledged !== true ||
      body.prototypeAcknowledged !== true ||
      body.feedbackAcknowledged !== true) {
    return NextResponse.json({ error: 'Fyll ut alle obligatoriske felt og bekreft vilkårene.' }, { status: 400, headers: noStore })
  }

  const db = pilotDb()
  if (!db) return NextResponse.json({ error: 'Siden er midlertidig utilgjengelig.' }, { status: 503, headers: noStore })

  // Never accept an email from the browser as authorization: verify the UUID
  // against the selected applicant record on every write.
  const { data: applicant, error: applicantError } = await db.from('pilot_applications')
    .select('id,full_name,email').eq('id', invite).eq('status', 'selected').maybeSingle()
  if (applicantError) {
    console.error('[pilot-confirm] Failed to verify invitation.', { code: applicantError.code })
    return NextResponse.json({ error: 'Kunne ikke bekrefte invitasjonen.' }, { status: 503, headers: noStore })
  }
  if (!applicant) return NextResponse.json({ error: 'Invitasjonen er ikke aktiv.' }, { status: 403, headers: noStore })

  const timestamp = new Date().toISOString()
  const { error } = await db.from('pilot_confirmations').insert({
    application_id: applicant.id,
    full_name: fullName,
    phone,
    shipping_address_line1: addressLine1,
    shipping_address_line2: addressLine2 || null,
    shipping_postal_code: postalCode,
    shipping_city: city,
    shipping_country: 'Norge',
    loan_acknowledged_at: timestamp,
    prototype_acknowledged_at: timestamp,
    feedback_acknowledged_at: timestamp,
    confirmed_at: timestamp,
    terms_version: TERMS_VERSION,
  })
  if (error && error.code !== '23505') {
    console.error('[pilot-confirm] Failed to store confirmation.', { code: error.code })
    return NextResponse.json({ error: 'Kunne ikke lagre bekreftelsen. Prøv igjen.' }, { status: 500, headers: noStore })
  }
  // An already submitted confirmation is immutable from this public endpoint.
  const alreadyConfirmed = error?.code === '23505'
  let confirmationEmailSent = false
  if (!alreadyConfirmed) {
    const emailResult = await sendPilotParticipationConfirmation({
      fullName: applicant.full_name,
      email: applicant.email,
    })
    confirmationEmailSent = emailResult.sent
  }

  return NextResponse.json({ ok: true, alreadyConfirmed, confirmationEmailSent }, { headers: noStore })
}
