import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const frameNames = {
  'american-walnut': 'American Walnut',
  'dark-charcoal': 'Dark Charcoal',
  'light-oak': 'Light Oak',
} as const

const matteNames = {
  beige: 'Beige',
  'solid-black': 'Solid Black',
  'new-castle': 'New Castle',
  sanguine: 'Sanguine',
  'midnight-blue-velour': 'Midnight Blue Velour',
  'silver-birch': 'Silver Birch',
} as const

const limitedMatteIds = new Set<keyof typeof matteNames>(['midnight-blue-velour', 'silver-birch'])

function text(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid order.' }, { status: 400 })
  }

  // Quiet honeypot for basic bot submissions. Return success so bots do not retry.
  if (text(body.website, 200)) {
    return NextResponse.json({ ok: true })
  }

  const fullName = text(body.fullName, 120)
  const email = text(body.email, 200).toLowerCase()
  const addressLine1 = text(body.addressLine1, 160)
  const addressLine2 = text(body.addressLine2, 160) || null
  const postalCode = text(body.postalCode, 16)
  const city = text(body.city, 100)
  const country = text(body.country, 80)
  const frameId = text(body.frameId, 60) as keyof typeof frameNames
  const matteId = text(body.matteId, 60) as keyof typeof matteNames

  if (!fullName || !emailPattern.test(email) || !addressLine1 || !postalCode || !city || !country) {
    return NextResponse.json({ error: 'Please complete your email and shipping address.' }, { status: 400 })
  }

  if (!Object.hasOwn(frameNames, frameId) || !Object.hasOwn(matteNames, matteId)) {
    return NextResponse.json({ error: 'Please choose a valid frame and matte.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Pilot ordering is not configured yet.' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('pilot_orders')
    .upsert(
      {
        full_name: fullName,
        email,
        shipping_address_line1: addressLine1,
        shipping_address_line2: addressLine2,
        shipping_postal_code: postalCode,
        shipping_city: city,
        shipping_country: country,
        frame_id: frameId,
        frame_name: frameNames[frameId],
        matte_id: matteId,
        matte_name: matteNames[matteId],
        matte_limited_edition: limitedMatteIds.has(matteId),
        status: 'submitted',
        source: 'pilot-page',
        updated_at: now,
      },
      { onConflict: 'email' },
    )
    .select('id')
    .single()

  if (error) {
    console.error('[pilot-orders] Unable to save pilot order.', {
      emailDomain: email.split('@')[1] || 'unknown',
      frameId,
      matteId,
      code: error.code,
      message: error.message,
    })
    return NextResponse.json({ error: 'Could not save your pilot order. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
