'use client'

import { useEffect, useState } from 'react'

type NewsRow = {
  id: string
  title: string
  url?: string
  published_at?: string | null
}

type NewsFeed = 'top' | 'latest'

export default function NewsModuleSettingsTab({
  language,
  feed,
  onFeedChange,
}: {
  language: 'en' | 'no'
  feed: NewsFeed
  onFeedChange: (feed: NewsFeed) => void
}) {
  const isNo = language === 'no'
  const [items, setItems] = useState<NewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let alive = true
    setItems([])
    setLoading(true)
    setFailed(false)
    setStale(false)
    const load = async () => {
      try {
        const response = await fetch(`/api/news?feed=${feed}&limit=20&links=1&display_profiles=standard`, { cache: 'no-store' })
        if (!response.ok) throw new Error('news')
        const payload = await response.json()
        if (!alive) return
        if (payload?.ok !== true) {
          setItems([])
          setFailed(true)
          setStale(false)
        } else {
          setItems(Array.isArray(payload?.items) ? payload.items : [])
          setStale(payload?.stale === true)
          setFailed(false)
        }
      } catch {
        if (alive) {
          setItems([])
          setFailed(true)
        }
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
  }, [feed])

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="mt-2 text-xl font-semibold tracking-widest">{isNo ? 'NYHETER' : 'NEWS'}</div>
      <div className="mt-1 text-sm text-[color:var(--fg-60)]">
        {isNo ? 'Velg hvilke nyheter som vises i appen og på rammen.' : 'Choose which stories appear in the app and on your frame.'}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label={isNo ? 'Nyhetskilde' : 'News feed'}>
        {(['top', 'latest'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={feed === option}
            onClick={() => onFeedChange(option)}
            className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${feed === option
              ? 'border-[#2aa3ff] text-[#2aa3ff] bg-[#2aa3ff]/10'
              : 'border-[color:var(--bd-20)] text-[color:var(--fg-70)]'}`}
          >
            {option === 'top' ? (isNo ? 'Toppsaker' : 'Top Stories') : (isNo ? 'Siste nytt' : 'Latest News')}
          </button>
        ))}
      </div>
      <div className="mt-2 text-xs text-[color:var(--fg-60)]">
        {feed === 'top'
          ? (isNo ? 'NRKs utvalgte hovedsaker, i NRKs rekkefølge.' : 'NRK’s selected top stories, in NRK’s order.')
          : (isNo ? 'De siste nyhetsoppdateringene fra NRK.' : 'The latest news updates from NRK.')}
      </div>

      {stale && !loading && !failed && (
        <div className="mt-2 text-xs text-[color:var(--fg-60)]">
          {isNo ? 'NRK er midlertidig utilgjengelig. Viser siste lagrede overskrifter.' : 'NRK is temporarily unavailable. Showing the last saved headlines.'}
        </div>
      )}

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
