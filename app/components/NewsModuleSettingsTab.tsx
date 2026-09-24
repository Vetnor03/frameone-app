'use client'

import { useEffect, useState } from 'react'

type NewsRow = {
  id: string
  title: string
  url?: string
  published_at?: string | null
}

export default function NewsModuleSettingsTab({ language }: { language: 'en' | 'no' }) {
  const isNo = language === 'no'
  const [items, setItems] = useState<NewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const response = await fetch('/api/news?limit=20&links=1&display_profiles=standard', { cache: 'no-store' })
        if (!response.ok) throw new Error('news')
        const payload = await response.json()
        if (!alive) return
        setItems(Array.isArray(payload?.items) ? payload.items : [])
        setFailed(false)
      } catch {
        if (alive) setFailed(true)
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(load, 30 * 60 * 1000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="mt-2 text-xl font-semibold tracking-widest">{isNo ? 'NYHETER' : 'NEWS'}</div>
      <div className="mt-1 text-sm text-[color:var(--fg-60)]">
        {isNo ? 'Siste overskrifter fra NRK. Trykk på en sak for å lese den hos NRK.' : 'Latest headlines from NRK. Tap a story to read it on NRK.'}
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-sm text-[color:var(--fg-60)]">{isNo ? 'Laster nyheter…' : 'Loading news…'}</div>
        ) : failed ? (
          <div className="text-sm text-[color:var(--fg-60)]">{isNo ? 'Kunne ikke hente nyheter akkurat nå.' : 'Could not load news right now.'}</div>
        ) : items.length <= 0 ? (
          <div className="text-sm text-[color:var(--fg-60)]">{isNo ? 'Ingen nyheter akkurat nå.' : 'No news right now.'}</div>
        ) : (
          <div className="divide-y divide-[color:var(--bd-10)]">
            {items.map((item) => (
              <a
                key={item.id}
                href={item.url || 'https://www.nrk.no/'}
                target="_blank"
                rel="noreferrer"
                className="block py-3.5 pr-2 text-[15px] leading-snug text-[color:var(--fg-90)] transition hover:text-[color:var(--fg)]"
              >
                {item.title}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="pt-3 text-[11px] tracking-[0.08em] text-[color:var(--fg-45)]">
        {isNo ? 'Kilde: NRK' : 'Source: NRK'}
      </div>
    </div>
  )
}
