'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase'

type AppLanguage = 'en' | 'no'

export default function TermsPage() {
  return (
    <Suspense fallback={null}>
      <TermsPageContent />
    </Suspense>
  )
}

function TermsPageContent() {
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

  const pageTitle = language === 'no' ? 'VILKÅR OG BETINGELSER' : 'TERMS & CONDITIONS'
  const updatedText =
    language === 'no' ? 'Sist oppdatert: 10. april 2026' : 'Last updated: April 10, 2026'

  const sections =
    language === 'no'
      ? [
          {
            title: 'BRUK AV APPEN',
            text: 'Disse vilkårene gjelder for bruk av denne appen (“appen”), som brukes til å konfigurere og administrere Frame-enheten din. Du samtykker i å bruke appen kun til det den er ment for.',
          },
          {
            title: 'KONTOER',
            text: 'Du er ansvarlig for å opprettholde tilgang til kontoen din og for å sikre at informasjonen din er korrekt.',
          },
          {
            title: 'ENHET OG TILKOBLING',
            text: 'Appen kommuniserer med Frame-enheten din og eksterne tjenester. Vi er ikke ansvarlige for nettverksproblemer, maskinvarefeil eller avbrudd i tredjepartstjenester.',
          },
          {
            title: 'TILGJENGELIGHET',
            text: 'Appen leveres “som den er”, uten garantier for uavbrutt eller feilfri drift.',
          },
          {
            title: 'ANSVAR',
            text: 'Så langt loven tillater det, er vi ikke ansvarlige for indirekte eller følgeskader, inkludert tap av data eller problemer med enheten.',
          },
          {
            title: 'ENDRINGER',
            text: 'Vi kan oppdatere disse vilkårene når som helst. Fortsatt bruk av appen betyr at du godtar de oppdaterte vilkårene.',
          },
          {
            title: 'LOVVALG',
            text: 'Disse vilkårene er underlagt norsk lov.',
          },
          {
            title: 'KONTAKT',
            text: 'For spørsmål, kontakt oss på support@re-mind.no',
          },
        ]
      : [
          {
            title: 'USE OF THE APP',
            text: 'These terms apply to the use of this app (“the App”), used to configure and manage your Frame device. You agree to use the App only for its intended purpose.',
          },
          {
            title: 'ACCOUNTS',
            text: 'You are responsible for maintaining access to your account and ensuring your information is accurate.',
          },
          {
            title: 'DEVICE AND CONNECTIVITY',
            text: 'The App communicates with your Frame device and external services. We are not responsible for network issues, hardware problems, or third-party service interruptions.',
          },
          {
            title: 'AVAILABILITY',
            text: 'The App is provided “as is” without guarantees of uninterrupted or error-free operation.',
          },
          {
            title: 'LIABILITY',
            text: 'To the extent permitted by law, we are not liable for any indirect or consequential damages, including data loss or device issues.',
          },
          {
            title: 'CHANGES',
            text: 'We may update these terms at any time. Continued use of the App means you accept the updated terms.',
          },
          {
            title: 'GOVERNING LAW',
            text: 'These terms are governed by the laws of Norway.',
          },
          {
            title: 'CONTACT',
            text: 'For any questions, contact us at support@re-mind.no',
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
