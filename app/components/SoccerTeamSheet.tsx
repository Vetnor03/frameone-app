'use client'

import React, { useEffect, useRef, useState } from 'react'

export type SoccerCfg = {
  id: number
  teamId?: string
  teamName?: string
  competitionId?: string
  competitionName?: string
}

type SoccerTeamItem = {
  teamId: string
  teamName: string
  competitionId?: string
  competitionName?: string
}

function toSoccerTeamItem(raw: any): SoccerTeamItem | null {
  const teamId = String(raw?.teamId ?? raw?.team?.id ?? raw?.id ?? '').trim()
  const teamName = String(raw?.teamName ?? raw?.team?.name ?? raw?.name ?? '').trim()
  const competitionId = String(raw?.competitionId ?? raw?.competition?.id ?? raw?.league?.id ?? '').trim()
  const competitionName = String(raw?.competitionName ?? raw?.competition?.name ?? raw?.league?.name ?? '').trim()

  if (!teamId || !teamName) return null

  return {
    teamId,
    teamName,
    competitionId: competitionId || undefined,
    competitionName: competitionName || undefined,
  }
}

export default function SoccerTeamSheet({
  title,
  onClose,
  onPicked,
}: {
  title: string
  onClose: () => void
  onPicked: (cfgPatch: Partial<SoccerCfg>) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SoccerTeamItem[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)

    const handle = window.setTimeout(async () => {
      try {
        const resp = await fetch(`/api/soccer/teams?q=${encodeURIComponent(q)}`, {
          cache: 'no-store',
        })

        if (!resp.ok) throw new Error('Search failed')

        const data: any = await resp.json()
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []

        console.log('soccer api data', data)
console.log('soccer items', items)

setResults(items as SoccerTeamItem[])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(handle)
  }, [query])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">
            {title.toUpperCase()}
          </div>

          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-4">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search team"
            className="w-full h-12 rounded-2xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-4 text-[color:var(--fg-90)] outline-none"
          />
        </div>

        <div className="mt-3 text-xs tracking-widest text-[color:var(--fg-40)]">
          {loading ? 'SEARCHING…' : results.length > 0 ? 'RESULTS' : query.trim().length >= 2 ? 'NO RESULTS' : ''}
        </div>

        <div className="mt-3 max-h-[52vh] overflow-auto rounded-2xl border border-[color:var(--bd-10)]">
          {results.map((r) => (
            <button
              key={`${r.teamId}-${r.competitionId || 'comp'}`}
              onClick={() =>
                onPicked({
                  teamId: r.teamId,
                  teamName: r.teamName,
                  competitionId: r.competitionId || undefined,
                  competitionName: r.competitionName || undefined,
                })
              }
              className="w-full text-left px-4 py-4 border-b border-[color:var(--bd-10)] last:border-b-0 hover:bg-[color:var(--panel-05)]"
            >
              <div className="text-[color:var(--fg-90)] text-base font-medium">
                {r.teamName}
              </div>

              {r.competitionName ? (
                <div className="text-[color:var(--fg-40)] text-xs mt-1">
                  {r.competitionName}
                </div>
              ) : null}
            </button>
          ))}

          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <div className="px-4 py-4 text-[color:var(--fg-50)]">No teams found</div>
          )}
        </div>
      </div>
    </div>
  )
}