'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ShopLegalPage from '../components/ShopLegalPage'

const updatedText = 'Last updated: July 28, 2026'

const sections = [
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

  function goBack() {
    if (from === 'settings') router.replace('/?tab=settings&nosplash=1')
    else router.back()
  }

  if (from === 'shop') {
    return <ShopLegalPage title="Cookies policy" updatedText={updatedText} sections={sections} />
  }

  return (
    <main className="min-h-screen bg-[#061b24] text-white flex justify-center">
      <div className="w-full max-w-[420px] px-5 pt-10 pb-10">
        <Header title="COOKIES POLICY" onBack={goBack} />
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
