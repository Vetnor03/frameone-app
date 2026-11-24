'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function matchesFamilyWallSearch(query: string) {
  const term = query.trim().toLocaleLowerCase()
  return !term || ['familywall', 'family calendar', 'familiekalender', 'shopping lists', 'handlelister', 'under evaluation', 'under vurdering'].some(value => value.includes(term))
}

export default function FamilyWallConnectCard({ language, userId }: { language: 'en' | 'no'; userId?: string | null }) {
  const [eligibleUser, setEligibleUser] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const no = language === 'no'
  const eligible = !!userId && eligibleUser === userId
  useEffect(() => {
    let active = true
    if (!userId) return
    void (async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token
        if (!token) return
        const response = await fetch('/api/integrations/familywall/probe?mode=status', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
        const data = await response.json()
        if (active && response.ok && data.eligible === true) setEligibleUser(userId)
      } catch { /* Non-eligible users see only the evaluation label. */ }
    })()
    return () => { active = false }
  }, [userId])

  async function connect() {
    if (!eligible || busy) return
    setBusy(true)
    setError('')
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) throw new Error()
      const response = await fetch('/api/integrations/familywall/probe', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || typeof data.url !== 'string' || new URL(data.url).protocol !== 'https:') throw new Error()
      window.location.assign(data.url)
    } catch {
      setError(no ? 'Kunne ikke starte FamilyWall-tilkoblingen. Prøv igjen.' : 'Could not start the FamilyWall connection. Try again.')
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#64748b]">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-[22px] w-[22px] text-white"><path d="M12 3 2 11h3v10h14V11h3L12 3Zm0 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm-4 9a4 4 0 0 1 8 0H8Z"/></svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[color:var(--fg-90)]">FamilyWall</div>
            <div className="mt-1 text-xs leading-snug text-[color:var(--fg-45)]">{no ? 'Familiekalender, oppgaver og handlelister' : 'Family calendar, tasks and shopping lists'}</div>
            {eligible && <p className="mt-1 text-xs text-[color:var(--fg-45)]">{no ? 'Tester innlogging og tilgjengelige funksjoner. Ingen data synkroniseres ennå.' : 'Tests sign-in and available features. No data is synced yet.'}</p>}
          </div>
        </div>
        {eligible ? (
          <button type="button" disabled={busy} onClick={() => void connect()} className="min-h-8 shrink-0 rounded-xl border border-[color:var(--bd-20)] bg-[color:var(--panel-05)] px-3 py-1.5 text-[11px] font-medium tracking-[0.08em] text-[color:var(--fg-70)] disabled:opacity-50">
            {busy ? (no ? 'KOBLER…' : 'CONNECTING…') : (no ? 'TEST TILKOBLING' : 'TEST CONNECTION')}
          </button>
        ) : <span className="shrink-0 text-[11px] font-medium text-[color:var(--fg-60)]">{no ? 'Under vurdering' : 'Under evaluation'}</span>}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-[#d94b4b]">{error}</p>}
    </div>
  )
}
