'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase'

type AppLanguage = 'en' | 'no'

export default function ContactPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const from = sp.get('from')

  const [language, setLanguage] = useState<AppLanguage>('en')

  function goBack() {
    if (from === 'settings') router.replace('/?tab=settings')
    else router.back()
  }

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

  const pageTitle = language === 'no' ? 'KONTAKT' : 'CONTACT'

  return (
    <main className="min-h-screen bg-[#061b24] text-white flex justify-center">
      <div className="w-full max-w-[420px] px-5 pt-10 pb-10">
        <Header title={pageTitle} onBack={goBack} />

        <div className="mt-6 text-white/70 leading-relaxed space-y-5">
          <p>
            {language === 'no'
              ? 'Spørsmål, problemer eller tilbakemeldinger?'
              : 'Questions, issues, or feedback?'}
          </p>

          <p>
            {language === 'no'
              ? 'Ta kontakt, så svarer vi så snart som mulig.'
              : 'Get in touch and we’ll get back to you as soon as possible.'}
          </p>

          <div className="pt-2">
            <div className="text-white/60 text-xs tracking-widest">
              {language === 'no' ? 'E-POST' : 'EMAIL'}
            </div>
            <div className="mt-1 text-white/80">post@test.com</div>
          </div>
        </div>
      </div>
    </main>
  )
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between">
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