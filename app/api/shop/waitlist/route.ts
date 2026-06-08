import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendWaitlistWelcomeEmail } from '@/app/lib/waitlistEmail'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type WaitlistSignup = {
  id: string
  email: string
  name: string | null
  source: string
  created_at: string
  waitlist_number: number | null
}

const waitlistColumns = 'id,email,name,source,created_at,waitlist_number'

function isDuplicateEmailError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  if (error.code !== '23505') return false

  const duplicateContext = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return duplicateContext.includes('email')
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null
  const source = typeof body?.source === 'string' && body.source.trim() ? body.source.trim() : 'shop'

  if (!email || !emailPattern.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Waitlist is not configured.' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase
    .from('waitlist_signups')
    .insert({ email, name, source })
    .select(waitlistColumns)
    .single<WaitlistSignup>()

  if (!error) {
    await sendWaitlistWelcomeEmail(data)
    return NextResponse.json({ ok: true, signup: data })
  }

  if (isDuplicateEmailError(error)) {
    const { data: existingSignup, error: existingError } = await supabase
      .from('waitlist_signups')
      .select(waitlistColumns)
      .eq('email', email)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle<WaitlistSignup>()

    if (!existingError && existingSignup) {
      return NextResponse.json({ ok: true, signup: existingSignup })
    }

    console.error('Unable to load existing waitlist signup after duplicate email insert.', {
      email,
      insertError: error,
      existingError,
    })
    return NextResponse.json({ error: 'Unable to join the waitlist right now.' }, { status: 500 })
  }

  console.error('Unable to create waitlist signup.', { email, source, error })
  return NextResponse.json({ error: 'Unable to join the waitlist right now.' }, { status: 500 })
}
