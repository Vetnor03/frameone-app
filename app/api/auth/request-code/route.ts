import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 5

const requestLog = new Map<string, number[]>()

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

type OtpFlow = 'login_otp' | 'signup_otp' | 'confirmation_otp' | 'unknown'

function classifyOtpFlow(source?: string): OtpFlow {
  const value = source?.toLowerCase() || ''

  if (!value) return 'unknown'
  if (value.includes('login')) return 'login_otp'
  if (value.includes('signup') || value.includes('create user')) return 'signup_otp'
  if (value.includes('confirm') || value.includes('verification')) return 'confirmation_otp'

  return 'unknown'
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

  if (!supabaseUrl || !supabaseAnonKey) {
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

  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const otpFlow: OtpFlow = 'login_otp'

  let { error: otpError } = await anon.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  })

  const detectedFlow = classifyOtpFlow(otpError?.message)
  const shouldProvisionConfirmedUser = Boolean(otpError) && detectedFlow !== 'login_otp'

  if (shouldProvisionConfirmedUser) {
    if (!serviceRoleKey) {
      console.warn('[auth] signInWithOtp failed and service key is missing', {
        otpFlow,
        detectedFlow,
        message: otpError?.message || null,
      })
      return jsonError('Could not send your login code. Please try again.', 500)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { error: createUserError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    })

    if (createUserError) {
      const duplicateUserCode = createUserError.message.toLowerCase().includes('already')
      if (!duplicateUserCode) {
        console.warn('[auth] createUser failed', {
          otpFlow,
          detectedFlow,
          message: createUserError.message,
          name: createUserError.name,
          status: (createUserError as { status?: number }).status,
        })
        return jsonError('Could not send your login code. Please try again.', 500)
      }
    }

    const retry = await anon.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    otpError = retry.error
  }

  if (otpError) {
    console.warn('[auth] signInWithOtp failed', {
      otpFlow,
      detectedFlow: classifyOtpFlow(otpError.message),
      message: otpError.message,
      name: otpError.name,
      status: (otpError as { status?: number }).status,
      codeLengthHint: process.env.SUPABASE_EMAIL_OTP_LENGTH || 'default',
    })
    return jsonError('Could not send your login code. Please try again.', 500)
  }

  console.info('[auth] OTP requested', {
    otpFlow,
    detectedFlow: classifyOtpFlow('login'),
    emailDomain: email.split('@')[1] || 'unknown',
  })

  return NextResponse.json({ ok: true })
}
