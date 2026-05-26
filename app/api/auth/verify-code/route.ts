import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_LENGTH = 8

type OtpFlow = 'login_otp' | 'signup_otp' | 'confirmation_otp' | 'unknown'

function classifyOtpFlow(source?: string): OtpFlow {
  const value = source?.toLowerCase() || ''

  if (!value) return 'unknown'
  if (value.includes('login')) return 'login_otp'
  if (value.includes('signup') || value.includes('create user')) return 'signup_otp'
  if (value.includes('confirm') || value.includes('verification')) return 'confirmation_otp'

  return 'unknown'
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError('Login is temporarily unavailable. Please try again shortly.', 500)
  }

  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const tokenDigitsOnly = /^\d+$/.test(token)
  const tokenHasExpectedLength = token.length === OTP_LENGTH
  const verifyType = 'email' as const

  if (!email || !EMAIL_REGEX.test(email)) {
    return jsonError('Please enter a valid email address.')
  }

  if (!token || !tokenDigitsOnly || !tokenHasExpectedLength) {
    return jsonError(`Please enter the full ${OTP_LENGTH}-digit code.`)
  }

  const cookieStore = await cookies()
  let cookieWrites = 0

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookieWrites += cookiesToSet.length
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options)
        }
      },
    },
  })

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: verifyType,
  })

  const detectedFlow = classifyOtpFlow(error?.message)
  console.info('[auth] verifyOtp result', {
    detectedFlow,
    emailDomain: email.split('@')[1] || 'unknown',
    tokenLength: token.length,
    verifyType,
    errorCode: (error as { code?: string } | null)?.code || null,
    errorMessage: error?.message || null,
    hasSession: Boolean(data.session),
    hasUser: Boolean(data.user),
    cookieWrites,
  })

  if (error) {
    return jsonError('Could not verify the code. Please try again.', 400)
  }

  return NextResponse.json({ ok: true })
}
