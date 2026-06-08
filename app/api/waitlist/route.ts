import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendWaitlistWelcomeEmail } from '@/app/lib/server/waitlistEmail'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type WaitlistPayload = {
  email?: unknown
  name?: unknown
  source?: unknown
  product_interest?: unknown
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as WaitlistPayload
  const email = cleanString(payload.email).toLowerCase()
  const name = cleanString(payload.name) || null
  const source = cleanString(payload.source) || 'shop'
  const productInterest = cleanString(payload.product_interest) || null

  if (!email || !emailPattern.test(email)) {
    return NextResponse.json({ error: 'Skriv inn en gyldig e-postadresse.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Ventelisten er ikke konfigurert ennå.' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error } = await supabase
    .from('waitlist_signups')
    .upsert(
      {
        email,
        name,
        source,
        product_interest: productInterest,
      },
      { onConflict: 'email' },
    )

  if (error) {
    console.error('Waitlist signup failed', error)
    return NextResponse.json({ error: 'Kunne ikke melde deg på akkurat nå.' }, { status: 500 })
  }

  await sendWaitlistWelcomeEmail({ email, name, productInterest })

  return NextResponse.json({ ok: true })
}
