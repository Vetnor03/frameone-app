'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ShopLegalPage from '../components/ShopLegalPage'
import { supabase } from '../lib/supabase'

type AppLanguage = 'en' | 'no'

const englishSections = [
  {
    title: 'Essential cookies',
    text: 'We use essential authentication cookies provided through Supabase to keep you securely signed in, refresh your session, and protect access to your account. These cookies are necessary for the service to work and cannot be switched off through a cookie preference tool.',
  },
  {
    title: 'Analytics',
    text: 'We use Vercel Web Analytics to understand aggregated site usage and improve the shop and app. This analytics service is designed without cookies and does not build a profile of you for advertising.',
  },
  {
    title: 'Local storage',
    text: 'The shop stores your cart in your browser so it remains available as you move between pages. The app may also remember preferences such as your selected theme and active device. Local storage is not a cookie and stays on your device until you clear it or the app replaces it.',
  },
  {
    title: 'No advertising cookies',
    text: 'We do not use advertising cookies or third-party cookies to follow you across websites, and we do not sell information about your browsing activity.',
  },
  {
    title: 'Managing your data',
    text: 'You can remove cookies and local storage through your browser settings. Removing authentication cookies will sign you out, and clearing local storage may reset your cart and saved preferences.',
  },
  {
    title: 'Contact',
    text: 'If you have questions about our use of cookies or similar browser storage, contact us at support@re-mind.no.',
  },
]

const norwegianSections = [
  {
    title: 'NØDVENDIGE INFORMASJONSKAPSLER',
    text: 'Vi bruker nødvendige informasjonskapsler for innlogging gjennom Supabase. Disse holder deg sikkert innlogget, fornyer økten din og beskytter tilgangen til kontoen. Informasjonskapslene er nødvendige for at tjenesten skal fungere og kan derfor ikke deaktiveres gjennom innstillingene for informasjonskapsler.',
  },
  {
    title: 'ANALYSE',
    text: 'Vi bruker Vercel Web Analytics for å forstå samlet bruk av nettsiden og forbedre nettbutikken og appen. Analysetjenesten bruker ikke informasjonskapsler og oppretter ikke en profil av deg for annonsering.',
  },
  {
    title: 'LOKAL LAGRING',
    text: 'Nettbutikken lagrer handlekurven lokalt i nettleseren, slik at den er tilgjengelig når du går mellom ulike sider. Appen kan også huske innstillinger som valgt tema og aktiv enhet. Lokal lagring er ikke en informasjonskapsel og blir liggende på enheten til du sletter den eller appen erstatter innholdet.',
  },
  {
    title: 'INGEN INFORMASJONSKAPSLER FOR ANNONSERING',
    text: 'Vi bruker ikke informasjonskapsler for annonsering eller informasjonskapsler fra tredjeparter til å følge deg på tvers av nettsteder. Vi selger heller ikke informasjon om nettleseraktiviteten din.',
  },
  {
    title: 'ADMINISTRERING AV LAGREDE DATA',
    text: 'Du kan slette informasjonskapsler og lokalt lagrede data gjennom innstillingene i nettleseren. Dersom du sletter informasjonskapslene for innlogging, blir du logget ut. Sletting av lokal lagring kan også nullstille handlekurven og lagrede innstillinger.',
  },
  {
    title: 'KONTAKT',
    text: (
      <>
        Har du spørsmål om vår bruk av informasjonskapsler eller annen lagring i nettleseren, kan du kontakte oss på{' '}
        <a href="mailto:support@re-mind.no">support@re-mind.no</a>.
      </>
    ),
  },
]

export default function CookiesPage() {
  return (
    <Suspense fallback={null}>
      <CookiesPageContent />
    </Suspense>
  )
}

function CookiesPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from')
  const queryLanguage = searchParams.get('lang')
  const [language, setLanguage] = useState<AppLanguage>(queryLanguage === 'no' ? 'no' : 'en')

  useEffect(() => {
    if (queryLanguage === 'no' || queryLanguage === 'en') {
      setLanguage(queryLanguage)
      return
    }

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

        const nextLanguage = data?.settings_json?.language
        if (nextLanguage === 'no' || nextLanguage === 'en') setLanguage(nextLanguage)
      } catch {
        // Keep the English fallback.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [queryLanguage])

  const isNorwegian = language === 'no'
  const pageTitle = isNorwegian ? 'Informasjonskapsler' : 'Cookies policy'
  const updatedText = isNorwegian
    ? 'Sist oppdatert: 28. juli 2026'
    : 'Last updated: July 28, 2026'
  const sections = isNorwegian ? norwegianSections : englishSections

  function goBack() {
    if (from === 'settings') router.replace('/?tab=settings&nosplash=1')
    else router.back()
  }

  if (from === 'shop') {
    return (
      <ShopLegalPage
        title={pageTitle}
        updatedText={updatedText}
        sections={sections}
        backHref={isNorwegian ? '/shop?lang=no' : '/shop'}
        backLabel={isNorwegian ? 'TILBAKE TIL FORSIDEN' : 'Back to home'}
      />
    )
  }

  return (
    <main className="min-h-screen bg-[#061b24] text-white flex justify-center">
      <div className="w-full max-w-[420px] px-5 pt-10 pb-10">
        <Header title={isNorwegian ? pageTitle : 'COOKIES POLICY'} onBack={goBack} />
        <div className="mt-6 space-y-5 text-white/70 leading-relaxed">
          <p>{updatedText}</p>
          {sections.map((section) => (
            <section key={section.title} className="space-y-3 border-t border-white/10 pt-5">
              <h2 className="text-xs tracking-[0.18em] text-white/80 uppercase">{section.title}</h2>
              <p>{section.text}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <button onClick={onBack} aria-label="Go back" className="w-10 h-10 flex items-center justify-center text-white/60 text-3xl">
        ‹
      </button>
      <div className="text-center flex-1">
        <div className="text-xl font-semibold tracking-widest">{title}</div>
      </div>
      <div className="w-10 h-10" />
    </div>
  )
}
