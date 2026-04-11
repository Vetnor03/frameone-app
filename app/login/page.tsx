// app/login/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const nextPath = useMemo(() => {
    const raw = searchParams.get('next')
    // Basic safety: only allow internal paths
    if (!raw) return '/'
    if (!raw.startsWith('/')) return '/'
    return raw
  }, [searchParams])

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  // ✅ If already logged in, skip login screen
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) router.replace(nextPath)
    })()
  }, [router, nextPath])

  async function sendCode() {
    if (!email) return
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })

    setLoading(false)
    if (error) return alert(error.message)

    setStep('code')
  }

  async function verifyCode() {
    if (!email || !code) return
    setLoading(true)

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    })

    setLoading(false)
    if (error) return alert(error.message)

    router.replace(nextPath)
  }

  return (
    <main className="h-screen bg-[#061b24] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-widest text-center">LOGIN</h1>

        {step === 'email' ? (
          <>
            <p className="text-white/50 text-sm text-center mt-2">We’ll send you an 8-digit code</p>

            <input
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-8 w-full h-12 px-4 rounded-xl bg-transparent border border-white/20 outline-none"
              autoComplete="email"
            />

            <button
              onClick={sendCode}
              disabled={loading}
              className="mt-6 w-full h-12 rounded-xl border border-[#2aa3ff] text-[#2aa3ff] tracking-widest"
            >
              {loading ? 'SENDING...' : 'SEND CODE'}
            </button>
          </>
        ) : (
          <>
            <p className="text-white/50 text-sm text-center mt-2">
              Enter the code we sent to
              <br />
              <span className="text-white/80">{email}</span>
            </p>

            <input
              inputMode="numeric"
              placeholder="12345678"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
              className="mt-8 w-full h-12 px-4 rounded-xl bg-transparent border border-white/20 outline-none tracking-widest text-center"
              autoComplete="one-time-code"
            />

            <button
              onClick={verifyCode}
              disabled={loading}
              className="mt-6 w-full h-12 rounded-xl border border-[#2aa3ff] text-[#2aa3ff] tracking-widest"
            >
              {loading ? 'VERIFYING...' : 'VERIFY CODE'}
            </button>

            <button
              onClick={() => {
                setCode('')
                setStep('email')
              }}
              className="mt-3 w-full h-12 rounded-xl border border-white/15 text-white/60 tracking-widest"
            >
              BACK
            </button>
          </>
        )}
      </div>
    </main>
  )
}
