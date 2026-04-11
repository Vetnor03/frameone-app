'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase'

type AppLanguage = 'en' | 'no'

export default function PrivacyPage() {
  return (
    <Suspense fallback={null}>
      <PrivacyPageContent />
    </Suspense>
  )
}

function PrivacyPageContent() {
  const router = useRouter()
  const sp = useSearchParams()
  const from = sp.get('from')

  const [language, setLanguage] = useState<AppLanguage>('en')

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  function goBack() {
    if (from === 'settings') router.replace('/?tab=settings')
    else router.back()
  }

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const updateFades = () => {
      const { scrollTop, scrollHeight, clientHeight } = el

      const atTop = scrollTop <= 0
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1

      setShowTopFade(!atTop)
      setShowBottomFade(!atBottom)
    }

    updateFades()

    el.addEventListener('scroll', updateFades)
    window.addEventListener('resize', updateFades)

    return () => {
      el.removeEventListener('scroll', updateFades)
      window.removeEventListener('resize', updateFades)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const activeDeviceId =
          typeof window !== 'undefined' ? localStorage.getItem('activeDeviceId') : null

        if (!activeDeviceId) return

        const { data, error } = await supabase
          .from('device_settings')
          .select('settings_json')
          .eq('device_id', activeDeviceId)
          .maybeSingle()

        if (error || cancelled) return

        const nextLang = data?.settings_json?.language
        if (nextLang === 'no' || nextLang === 'en') {
          setLanguage(nextLang)
        }
      } catch {
        // keep english fallback
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const pageTitle = language === 'no' ? 'PERSONVERN' : 'PRIVACY POLICY'
  const updatedText =
    language === 'no' ? 'Sist oppdatert: 10. april 2026' : 'Last updated: April 10, 2026'

  const sections =
    language === 'no'
      ? [
          {
            title: 'HVA VI SAMLER INN',
            text: 'Vi samler inn kontoinformasjon (e-post), enhetsdata (innstillinger og konfigurasjon) og innhold du selv oppretter, som påminnelser og preferanser.',
          },
          {
            title: 'HVORDAN VI BRUKER DATA',
            text: 'Dataene dine brukes til å autentisere kontoen din, synkronisere med Frame-enheten din og levere appens kjernefunksjoner.',
          },
          {
            title: 'RETTSLIG GRUNNLAG',
            text: 'Vi behandler dataene dine for å levere tjenesten (avtale) og for å vedlikeholde og forbedre appen (berettiget interesse).',
          },
          {
            title: 'LAGRING',
            text: 'Data lagres sikkert ved hjelp av Supabase. Vi tar rimelige forholdsregler for å beskytte informasjonen din.',
          },
          {
            title: 'OPPBEVARINGSTID',
            text: 'Vi oppbevarer dataene dine så lenge kontoen din er aktiv. Du kan når som helst be om sletting.',
          },
          {
            title: 'INFORMASJONSKAPSLER',
            text: 'Vi bruker kun nødvendige informasjonskapsler for innlogging og grunnleggende funksjonalitet. Vi bruker ikke sporings- eller annonseringskapsler.',
          },
          {
            title: 'DELING',
            text: 'Vi selger ikke dataene dine. Data deles kun med infrastrukturelle tjenesteleverandører når det er nødvendig for å drifte tjenesten.',
          },
          {
            title: 'DINE RETTIGHETER',
            text: 'Du kan be om innsyn, retting eller sletting av dataene dine. Du kan også kontakte Datatilsynet ved behov.',
          },
          {
            title: 'KONTAKT',
            text: 'For spørsmål om personvern, kontakt post@test.com',
          },
        ]
      : [
          {
            title: 'WHAT WE COLLECT',
            text: 'We collect account information (email), device data (settings and configuration), and user-created content such as reminders and preferences.',
          },
          {
            title: 'HOW WE USE DATA',
            text: 'Your data is used to authenticate your account, sync with your Frame device, and provide core app functionality.',
          },
          {
            title: 'LEGAL BASIS',
            text: 'We process your data to provide the service (contract) and to maintain and improve the App (legitimate interest).',
          },
          {
            title: 'STORAGE',
            text: 'Data is securely stored using Supabase. We take reasonable steps to protect your information.',
          },
          {
            title: 'DATA RETENTION',
            text: 'We store your data as long as your account is active. You may request deletion at any time.',
          },
          {
            title: 'COOKIES',
            text: 'We only use essential cookies required for authentication and core functionality. No tracking or advertising cookies are used.',
          },
          {
            title: 'SHARING',
            text: 'We do not sell your data. Data is only shared with infrastructure providers when necessary to operate the service.',
          },
          {
            title: 'YOUR RIGHTS',
            text: 'You may request access, correction, or deletion of your data. You can also contact Datatilsynet if needed.',
          },
          {
            title: 'CONTACT',
            text: 'For any privacy-related questions, contact post@test.com',
          },
        ]

  return (
    <main className="h-screen bg-[#061b24] text-white flex justify-center overflow-hidden">
      <div className="w-full max-w-[420px] px-5 pt-10 pb-6 flex flex-col min-h-0">
        <Header title={pageTitle} onBack={goBack} />

        <div className="relative mt-6 flex-1 min-h-0">
          <div
            ref={scrollerRef}
            className="h-full overflow-y-auto pr-1 pb-6 text-white/70 leading-relaxed space-y-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <p>{updatedText}</p>

            {sections.map((section) => (
              <section key={section.title} className="space-y-3">
                <div className="pt-4 border-t border-white/10">
                  <p className="text-white/80 tracking-[0.18em] text-xs">{section.title}</p>
                </div>
                <p>{section.text}</p>
              </section>
            ))}
          </div>

          {showTopFade && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[#061b24] to-transparent" />
          )}

          {showBottomFade && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#061b24] to-transparent" />
          )}
        </div>
      </div>
    </main>
  )
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between shrink-0">
      <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-white/60 text-3xl">
        ‹
      </button>
      <div className="text-center flex-1">
        <div className="text-xl font-semibold tracking-widest">{title}</div>
      </div>
      <div className="w-10 h-10" />
    </div>
  )
}
