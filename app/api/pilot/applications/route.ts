import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isPilotApplicationClosed } from '@/app/lib/pilotApplicationDeadline'
import { sendPilotApplicationConfirmation } from '@/app/lib/pilotApplicationEmail'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const households = new Set(['me', 'shared'])
const platforms = new Set(['ios', 'android', 'both'])
const wifiOptions = new Set(['yes', 'no', 'unsure'])
const useCases = new Set(['reminders', 'calendar', 'weather_news', 'mixed', 'other'])

function field(value: unknown, limit: number) {
  if (typeof value !== 'string' || value.length > limit) return null
  return value.trim()
}

export async function POST(request: Request) {
  if (isPilotApplicationClosed()) {
    return NextResponse.json({ error: 'Påmeldingen er avsluttet.' }, { status: 410 })
  }
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 })
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 415 })
  }
  const raw = await request.text()
  if (raw.length > 6000) {
    return NextResponse.json({ error: 'Invalid application.' }, { status: 413 })
  }
  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid application.' }, { status: 400 })
  }

  // Basic anti-bot field, not visible to real applicants.
  if (field(body.website, 200)) return NextResponse.json({ ok: true })

  const fullName = field(body.fullName, 100)
  const email = field(body.email, 200)?.toLowerCase()
  const city = field(body.city, 80)
  const household = field(body.household, 32)
  const platform = field(body.platform, 32)
  const homeWifi = field(body.homeWifi, 32)
  const useCase = field(body.useCase, 32)
  const note = field(body.note, 400)
  if (!fullName || !email || !emailPattern.test(email) || !city ||
      !household || !households.has(household) ||
      !platform || !platforms.has(platform) ||
      !homeWifi || !wifiOptions.has(homeWifi) ||
      !useCase || !useCases.has(useCase) || note === null ||
      body.prototypeAcknowledged !== true ||
      body.returnAcknowledged !== true ||
      body.pilotContactAcknowledged !== true) {
    return NextResponse.json({ error: 'Please complete the application and required acknowledgements.' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Registration is unavailable.' }, { status: 503 })
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const acknowledgedAt = new Date().toISOString()
  // Check again immediately before storage: a request may cross the deadline during validation.
  if (isPilotApplicationClosed()) {
    return NextResponse.json({ error: 'Påmeldingen er avsluttet.' }, { status: 410 })
  }
  const { data, error } = await supabase.from('pilot_applications').insert({
    full_name: fullName, email, city, household, platform, home_wifi: homeWifi,
    use_case: useCase, note: note || null, terms_version: '2026-09-29-v3',
    prototype_acknowledged_at: acknowledgedAt,
    return_acknowledged_at: acknowledgedAt,
    feedback_acknowledged_at: acknowledgedAt,
    pilot_contact_acknowledged_at: acknowledgedAt,
    source: 'pilot-public-application',
  }).select('id').single<{ id: string }>()
  // Never disclose whether an email is already registered.
  if (error && error.code !== '23505') {
    console.error('[pilot-applications] insert failed:', { code: error.code, message: error.message })
    return NextResponse.json({ error: 'Could not save the application.' }, { status: 500 })
  }
  if (!error && data) {
    // Database insert is authoritative. A mail-provider failure must not lose the application.
    const confirmation = await sendPilotApplicationConfirmation({ fullName, email })
    if (confirmation.sent) {
      const { error: statusError } = await supabase.from('pilot_applications').update({
        confirmation_email_sent_at: new Date().toISOString(),
        confirmation_email_resend_id: confirmation.resendId,
      }).eq('id', data.id)
      if (statusError) {
        console.error('[pilot-applications] Confirmation accepted but email status could not be stored.', {
          code: statusError.code, message: statusError.message,
        })
      }
    }
  }
  // Same public response for new and existing emails; no public applicant lookup.
  return NextResponse.json({ ok: true })
}
