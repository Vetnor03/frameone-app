// app/login/page.tsx
'use client'

import type { ReactNode } from 'react'
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

type HomeScreenGuideSectionId = 'iphone' | 'android'

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
    >
      <path
        d="m6 9 6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path d="M12 8h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  )
}

type HomeScreenGuideStep = {
  label: string
  title: string
  helper: string
  icon: ReactNode
}

type HomeScreenGuideSection = {
  id: HomeScreenGuideSectionId
  title: string
  platformIcon: ReactNode
  steps: HomeScreenGuideStep[]
}

const iconClassName = 'h-8 w-8'

const homeScreenGuideSections: HomeScreenGuideSection[] = [
  {
    id: 'iphone',
    title: 'ON IPHONE',
    platformIcon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
        <path
          d="M15.7 2.6c-.9.1-1.9.7-2.5 1.4-.6.7-1 1.7-.9 2.6 1 0 2-.5 2.6-1.2.7-.8 1-1.7.8-2.8ZM19.1 17.2c-.4.9-.6 1.3-1.1 2.1-.7 1-1.7 2.3-2.9 2.3-1.1 0-1.4-.7-2.9-.7s-1.9.7-2.9.7c-1.2 0-2.1-1.2-2.8-2.2-2-3-2.3-6.4-1-8.3.9-1.3 2.3-2.1 3.7-2.1s2.3.7 3 .7 1.9-.8 3.3-.7c.5 0 2.1.2 3.1 1.6-2.7 1.5-2.3 5.2.5 6.6Z"
          fill="currentColor"
        />
      </svg>
    ),
    steps: [
      {
        label: '1',
        title: 'SHARE',
        helper: 'Tap the Share button at the bottom of Safari.',
        icon: (
          <svg viewBox="0 0 48 48" aria-hidden="true" className={iconClassName}>
            <path
              d="M24 29V8m0 0-7 7m7-7 7 7"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.25"
            />
            <path
              d="M15 22h-3.5A3.5 3.5 0 0 0 8 25.5v11A3.5 3.5 0 0 0 11.5 40h25a3.5 3.5 0 0 0 3.5-3.5v-11a3.5 3.5 0 0 0-3.5-3.5H33"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.25"
            />
          </svg>
        ),
      },
      {
        label: '2',
        title: 'ADD',
        helper: 'Scroll down, then choose ‘Add to Home Screen’.',
        icon: (
          <svg viewBox="0 0 48 48" aria-hidden="true" className={iconClassName}>
            <path
              d="M13 8h22a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Z"
              fill="none"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="2.25"
            />
            <path
              d="M24 17v14m-7-7h14"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2.35"
            />
          </svg>
        ),
      },
      {
        label: '3',
        title: 'DONE',
        helper: 'Tap ‘Add’ — the app is now on your home screen.',
        icon: (
          <svg viewBox="0 0 48 48" aria-hidden="true" className={iconClassName}>
            <path
              d="M13 24.5 21 32l15-17"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.65"
            />
            <path
              d="M10 13c2.5-4 7.2-6.5 14-6.5 10.5 0 18 7.2 18 17.5S34.5 41.5 24 41.5 6 34.2 6 24c0-2.2.4-4.2 1.1-6"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.9"
            />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'android',
    title: 'ON ANDROID',
    platformIcon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
        <path
          d="M7.3 9.2h9.4v7.2a2 2 0 0 1-2 2H9.3a2 2 0 0 1-2-2V9.2Zm1.5-3.8L7.3 3.6m7.9 1.8 1.5-1.8M6 10.1v5.1m12-5.1v5.1M10 18.5v2.1m4-2.1v2.1"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <path d="M10.2 7.1h.1m3.4 0h.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    ),
    steps: [
      {
        label: '1',
        title: 'MENU',
        helper: 'Tap the menu in the top right of Chrome.',
        icon: (
          <svg viewBox="0 0 48 48" aria-hidden="true" className={iconClassName}>
            <path
              d="M24 15.5h.1M24 24h.1M24 32.5h.1"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="5"
            />
          </svg>
        ),
      },
      {
        label: '2',
        title: 'ADD',
        helper: 'Tap ‘Add to Home screen’.',
        icon: (
          <svg viewBox="0 0 48 48" aria-hidden="true" className={iconClassName}>
            <path
              d="m10 23.5 14-12 14 12M15 22v16h18V22"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.25"
            />
            <path
              d="M24 25v9m-4.5-4.5h9"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2.35"
            />
          </svg>
        ),
      },
      {
        label: '3',
        title: 'DONE',
        helper: 'Tap ‘Add’ — the app is now on your home screen.',
        icon: (
          <svg viewBox="0 0 48 48" aria-hidden="true" className={iconClassName}>
            <path
              d="M13 24.5 21 32l15-17"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.65"
            />
            <path
              d="M10 13c2.5-4 7.2-6.5 14-6.5 10.5 0 18 7.2 18 17.5S34.5 41.5 24 41.5 6 34.2 6 24c0-2.2.4-4.2 1.1-6"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.9"
            />
          </svg>
        ),
      },
    ],
  },
]

function HomeScreenGuideSteps({ section }: { section: HomeScreenGuideSection }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-1.5">
      {section.steps.map((item, index) => (
        <div key={`${section.id}-${item.label}`} className="contents">
          <article className="flex min-w-0 flex-col items-center text-center">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#2aa3ff]/25 text-[0.6rem] font-semibold text-white/45">
              {item.label}
            </span>
            <div className="mt-2.5 flex h-9 items-center justify-center text-[#5fa7d8]/90">{item.icon}</div>
            <h3 className="mt-2.5 text-[0.66rem] font-semibold tracking-[0.18em] text-white/55">{item.title}</h3>
            <p className="mt-1.5 max-w-[7.1rem] text-[0.61rem] font-medium leading-snug text-white/35">
              {item.helper}
            </p>
          </article>

          {index < section.steps.length - 1 ? (
            <div className="pt-[3.8rem]" aria-hidden="true">
              <span className="block h-px w-5 border-t border-dotted border-white/14" />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function HomeScreenGuidePlatform({
  expanded,
  onToggle,
  section,
}: {
  expanded: boolean
  onToggle: () => void
  section: HomeScreenGuideSection
}) {
  const contentId = `home-screen-guide-${section.id}`

  return (
    <div className="border-b border-white/10">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 py-3 text-left text-white/45"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
      >
        <span className="flex items-center gap-2.5">
          <span className="text-white/35">{section.platformIcon}</span>
          <span className="text-[0.63rem] font-semibold tracking-[0.22em] text-white/45">{section.title}</span>
        </span>
        <span className="text-white/35">
          <ChevronIcon isOpen={expanded} />
        </span>
      </button>

      {expanded ? (
        <div id={contentId} className="pb-5 pt-2">
          <HomeScreenGuideSteps section={section} />
        </div>
      ) : null}
    </div>
  )
}

function HomeScreenGuide() {
  const isStandalone = useStandaloneDisplayMode()
  const [activeGuideId, setActiveGuideId] = useState<HomeScreenGuideSectionId | null>(null)

  return (
    <section aria-label="Add to home screen guide" className="mt-9 text-center">
      <div className="flex w-full items-center gap-3 py-2.5 text-left text-white/45">
        <span className="text-[#5fa7d8]/80">
          <InfoIcon />
        </span>
        <span className="text-[0.64rem] font-semibold tracking-[0.22em] text-white/50">TIP</span>
        <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-white/35">
          {isStandalone ? "You're using the home screen app. These steps are here if you need them again." : "Add the app to your home screen for a better experience."}
        </span>
      </div>

      <div className="mt-2 border-t border-white/10">
        {homeScreenGuideSections.map((section) => (
          <HomeScreenGuidePlatform
            key={section.id}
            expanded={activeGuideId === section.id}
            section={section}
            onToggle={() => setActiveGuideId((current) => (current === section.id ? null : section.id))}
          />
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
    <main className="min-h-screen overflow-y-auto bg-[#061b24] px-5 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
        <header
          className="flex items-center justify-between pb-6 pt-5"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 1.25rem)' }}
        >
          <span className="text-xs font-semibold tracking-[0.2em] text-white/45">RE:MIND</span>
          <a
            href="/shop"
            className="rounded-full border border-white/14 px-3 py-1.5 text-xs font-medium tracking-[0.16em] text-white/65 transition hover:border-white/30 hover:text-white/85"
          >
            SHOP
          </a>
        </header>

        <section className="flex flex-1 flex-col justify-center pb-14 pt-8">
          <h1 className="text-center text-2xl font-semibold tracking-widest">LOGIN</h1>

          {step === 'email' ? (
            <div className="relative">
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
            </div>
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
        </section>
      </div>
    </main>
  )
}
