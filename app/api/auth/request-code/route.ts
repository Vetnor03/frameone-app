import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 5

const requestLog = new Map<string, number[]>()

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for') || ''
  const firstForwardedIp = forwardedFor.split(',')[0]?.trim()
  return firstForwardedIp || request.headers.get('x-real-ip') || 'unknown'
}

function isRateLimited(key: string, now: number) {
  const prior = requestLog.get(key) || []
  const active = prior.filter((ts) => now - ts < WINDOW_MS)

  if (active.length >= MAX_REQUESTS_PER_WINDOW) {
    requestLog.set(key, active)
    return true
  }

  active.push(now)
  requestLog.set(key, active)
  return false
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

  const now = Date.now()
  const ip = getClientIp(request)

  if (isRateLimited(`ip:${ip}`, now) || isRateLimited(`email:${email}`, now)) {
    return jsonError('Too many code requests. Please wait a few minutes and try again.', 429)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let existingUser: { id: string; email_confirmed_at?: string | null } | undefined
  let page = 1
  const perPage = 200

  while (page <= 10 && !existingUser) {
    const { data, error: listError } = await admin.auth.admin.listUsers({
      page,
      perPage,
    })

    if (listError) {
      return jsonError('Could not send your login code. Please try again.', 500)
    }

    existingUser = data.users.find((user) => user.email?.toLowerCase() === email)

    if (!data.users.length || data.users.length < perPage) break
    page += 1
  }

  if (!existingUser) {
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { created_via: 'login_otp_bootstrap' },
    })

    if (createError) {
      return jsonError('Could not send your login code. Please try again.', 500)
    }
  } else if (!existingUser.email_confirmed_at) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existingUser.id, {
      email_confirm: true,
    })

    if (updateError) {
      return jsonError('Could not send your login code. Please try again.', 500)
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
    console.warn('[auth] signInWithOtp failed', {
      message: otpError.message,
      name: otpError.name,
      status: (otpError as { status?: number }).status,
      codeLengthHint: process.env.SUPABASE_EMAIL_OTP_LENGTH || 'default',
    })
    return jsonError('Could not send your login code. Please try again.', 500)
  }

  return NextResponse.json({ ok: true })
}
