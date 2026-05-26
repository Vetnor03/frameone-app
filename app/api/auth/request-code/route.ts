import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonError('Login is temporarily unavailable. Please try again shortly.', 500)
  }

  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email || !EMAIL_REGEX.test(email)) {
    return jsonError('Please enter a valid email address.')
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1,
    email,
  })

  if (listError) {
    return jsonError('Could not prepare login for this email. Please try again.', 500)
  }

  const existingUser = existingUsers?.users?.[0]

  if (!existingUser) {
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { created_via: 'login_otp_bootstrap' },
    })

    if (createError) {
      return jsonError('Could not prepare login for this email. Please try again.', 500)
    }
  } else if (!existingUser.email_confirmed_at) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existingUser.id, {
      email_confirm: true,
    })

    if (updateError) {
      return jsonError('Could not prepare login for this email. Please try again.', 500)
    }
  }

  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error: otpError } = await anon.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  })

  if (otpError) {
    return jsonError('Could not send your login code. Please try again.', 500)
  }

  return NextResponse.json({ ok: true })
}
