'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FeedbackPage() {
  const router = useRouter()
  const [from, setFrom] = useState<string | null>(null)

  function goBack() {
    if (from === 'settings') router.replace('/?tab=settings')
    else router.back()
  }

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      setFrom(params.get('from'))
    } catch {
      setFrom(null)
    }
  }, [])

  return (
    <main className="min-h-screen bg-[#061b24] text-white flex justify-center">
      <div className="w-full max-w-[420px] px-5 pt-10 pb-10">
        <Header title="FEEDBACK" onBack={goBack} />
        <div className="mt-6 text-white/70 leading-relaxed space-y-4">
          <p>This is a placeholder Feedback page.</p>
          <p>Next step: connect this to Supabase (feedback table + insert).</p>
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
