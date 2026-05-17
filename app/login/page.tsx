// app/login/page.tsx
'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

function getSafeNextPath() {
  if (typeof window === 'undefined') return '/'

  try {
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('next')

    if (!raw || !raw.startsWith('/')) return '/'

    return raw
  } catch {
    return '/'
  }
}

function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') return false

  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }

  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

function subscribeToStandaloneDisplayMode(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}

  const mediaQuery = window.matchMedia('(display-mode: standalone)')
  mediaQuery.addEventListener('change', onStoreChange)

  return () => mediaQuery.removeEventListener('change', onStoreChange)
}

function useStandaloneDisplayMode() {
  return useSyncExternalStore(subscribeToStandaloneDisplayMode, isStandaloneDisplayMode, () => false)
}

function HomeScreenGuide() {
  const isStandalone = useStandaloneDisplayMode()

  if (isStandalone) return null

  const steps = [
    {
      label: '1',
      title: 'SHARE',
      helper: 'Tap the Share button at the bottom of Safari.',
      icon: (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="h-9 w-9">
          <path
            d="M24 29V8m0 0-7 7m7-7 7 7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
          <path
            d="M15 22h-3.5A3.5 3.5 0 0 0 8 25.5v11A3.5 3.5 0 0 0 11.5 40h25a3.5 3.5 0 0 0 3.5-3.5v-11a3.5 3.5 0 0 0-3.5-3.5H33"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        </svg>
      ),
    },
    {
      label: '2',
      title: 'ADD',
      helper: 'Scroll down, then choose “Add to Home Screen”.',
      icon: (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="h-9 w-9">
          <path
            d="M13 8h22a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
          <path
            d="M24 17v14m-7-7h14"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.7"
          />
        </svg>
      ),
    },
    {
      label: '3',
      title: 'DONE',
      helper: 'Tap “Add” — the app is now on your home screen.',
      icon: (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="h-9 w-9">
          <path
            d="M13 24.5 21 32l15-17"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          <path
            d="M10 13c2.5-4 7.2-6.5 14-6.5 10.5 0 18 7.2 18 17.5S34.5 41.5 24 41.5 6 34.2 6 24c0-2.2.4-4.2 1.1-6"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      ),
    },
  ]

  return (
    <section aria-labelledby="home-screen-guide-title" className="mt-14 text-center">
      <div className="flex items-center justify-center gap-3 text-white/35">
        <span className="h-px w-12 bg-white/12" />
        <h2 id="home-screen-guide-title" className="text-[0.65rem] font-semibold tracking-[0.22em]">
          ADD TO HOME SCREEN
        </h2>
        <span className="h-px w-12 bg-white/12" />
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-1.5">
        {steps.map((item, index) => (
          <div key={item.label} className="contents">
            <article className="flex min-w-0 flex-col items-center text-center">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-[0.62rem] font-semibold text-white/45">
                {item.label}
              </span>
              <div className="mt-2 flex h-10 items-center justify-center text-[#5fa7d8]">
                {item.icon}
              </div>
              <h3 className="mt-2 text-[0.68rem] font-semibold tracking-[0.18em] text-white/55">{item.title}</h3>
              <p className="mt-1 max-w-[7.2rem] text-[0.62rem] font-medium leading-snug text-white/35">{item.helper}</p>
            </article>

            {index < steps.length - 1 ? (
              <div className="pt-[3.9rem]" aria-hidden="true">
                <span className="block h-px w-5 border-t border-dashed border-white/14" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

export default function LoginPage() {
  const router = useRouter()

  const nextPath = useMemo(() => getSafeNextPath(), [])
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
    <main className="h-screen overflow-y-auto bg-[#061b24] px-5 py-8 text-white">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center">
        <h1 className="text-center text-2xl font-semibold tracking-widest">LOGIN</h1>

        {step === 'email' ? (
          <>
            <p className="mt-2 text-center text-sm text-white/50">We’ll send you an 8-digit code</p>

            <input
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-8 h-12 w-full rounded-xl border border-white/20 bg-transparent px-4 outline-none"
              autoComplete="email"
            />

            <button
              onClick={sendCode}
              disabled={loading}
              className="mt-6 h-12 w-full rounded-xl border border-[#2aa3ff] text-[#2aa3ff] tracking-widest"
            >
              {loading ? 'SENDING...' : 'SEND CODE'}
            </button>

            <HomeScreenGuide />
          </>
        ) : (
          <>
            <p className="mt-2 text-center text-sm text-white/50">
              Enter the code we sent to
              <br />
              <span className="text-white/80">{email}</span>
            </p>

            <input
              inputMode="numeric"
              placeholder="12345678"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
              className="mt-8 h-12 w-full rounded-xl border border-white/20 bg-transparent px-4 text-center tracking-widest outline-none"
              autoComplete="one-time-code"
            />

            <button
              onClick={verifyCode}
              disabled={loading}
              className="mt-6 h-12 w-full rounded-xl border border-[#2aa3ff] text-[#2aa3ff] tracking-widest"
            >
              {loading ? 'VERIFYING...' : 'VERIFY CODE'}
            </button>

            <button
              onClick={() => {
                setCode('')
                setStep('email')
              }}
              className="mt-3 h-12 w-full rounded-xl border border-white/15 text-white/60 tracking-widest"
            >
              BACK
            </button>
          </>
        )}
      </div>
    </main>
  )
}
