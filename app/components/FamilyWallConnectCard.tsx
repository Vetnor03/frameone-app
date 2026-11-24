'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ReadProbeCheck } from '../lib/integrations/familywall/probe'

export function matchesFamilyWallSearch(query: string) {
  const term = query.trim().toLocaleLowerCase()
  return !term || ['familywall', 'family calendar', 'familiekalender', 'shopping lists', 'handlelister', 'under evaluation', 'under vurdering'].some(value => value.includes(term))
}

export default function FamilyWallConnectCard({ language, userId }: { language: 'en' | 'no'; userId?: string | null }) {
  const [eligibleUser, setEligibleUser] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<{ userId: string; checks: ReadProbeCheck[] | null; failed: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
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
        if (active && response.ok && data.eligible === true) {
          setEligibleUser(userId)
          setSummary({ userId, checks: Array.isArray(data.checks) ? data.checks : null, failed: new URLSearchParams(window.location.search).get('familywall_test') === 'error' })
        }
      } catch { /* Non-eligible users see only the evaluation label. */ }
    })()
    return () => { active = false }
  }, [userId])

  const currentSummary = eligible && summary?.userId === userId ? summary : null
  const checks = currentSummary?.checks
  const labelFor = (tool: ReadProbeCheck['tool']) => tool === 'list_events' ? (no ? 'Kalender' : 'Calendar') : tool === 'list_lists' ? (no ? 'Lister' : 'Lists') : (no ? 'Listeelementer' : 'List items')
  const statusFor = (status: ReadProbeCheck['status']) => status === 'ok' ? (no ? 'OK' : 'OK') : status === 'failed' ? (no ? 'Feilet' : 'Failed') : status === 'skipped' ? (no ? 'Hoppet over' : 'Skipped') : (no ? 'Ikke tilgjengelig' : 'Unavailable')

  async function connect() {
    if (!eligible || busy) return
    setBusy(true)
    setError('')
    setSummary(null)
    setCopied(false)
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
            {eligible && <p className="mt-1 text-xs text-[color:var(--fg-45)]">{no ? 'Tester innlogging, kalenderen de neste sju dagene og første liste. Ingen familieopplysninger lagres.' : 'Tests sign-in, the next seven days of calendar events and the first list. No family data is stored.'}</p>}
          </div>
        </div>
        {eligible ? (
          <button type="button" disabled={busy} onClick={() => void connect()} className="min-h-8 shrink-0 rounded-xl border border-[color:var(--bd-20)] bg-[color:var(--panel-05)] px-3 py-1.5 text-[11px] font-medium tracking-[0.08em] text-[color:var(--fg-70)] disabled:opacity-50">
            {busy ? (no ? 'KOBLER…' : 'CONNECTING…') : (no ? 'TEST TILKOBLING' : 'TEST CONNECTION')}
          </button>
        ) : <span className="shrink-0 text-[11px] font-medium text-[color:var(--fg-60)]">{no ? 'Under vurdering' : 'Under evaluation'}</span>}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-[#d94b4b]">{error}</p>}
      {currentSummary?.failed && <p role="alert" className="mt-2 text-xs text-[#d94b4b]">{no ? 'Tilkoblingstesten feilet eller ble avbrutt. Prøv igjen.' : 'The connection test failed or was cancelled. Try again.'}</p>}
      {checks && (
        <div role="status" className="mt-3 rounded-xl border border-[color:var(--bd-10)] p-3 text-xs text-[color:var(--fg-70)]">
          <p className="font-medium text-[color:var(--fg-90)]">{no ? 'Innlogging vellykket' : 'Sign-in successful'}</p>
          <p className="mt-1">{no ? 'Lesetest – ingen permanent tilkobling ennå.' : 'Read test – not a persistent connection yet.'}</p>
          <div className="mt-2 space-y-1">
            {checks.map(check => <div className="flex justify-between gap-2" key={check.tool}><span>{labelFor(check.tool)}</span><span className={check.status === 'ok' ? 'text-[#1f9d4a]' : 'text-[color:var(--fg-60)]'}>{statusFor(check.status)}</span></div>)}
          </div>
          <details className="mt-3">
            <summary>{no ? 'Tekniske detaljer (ingen persondata)' : 'Technical details (no personal data)'}</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all text-[10px]">{JSON.stringify(checks, null, 2)}</pre>
            <button type="button" className="mt-2 underline" onClick={() => { void navigator.clipboard.writeText(JSON.stringify(checks, null, 2)).then(() => setCopied(true)).catch(() => setCopied(false)) }}>{copied ? (no ? 'Kopiert' : 'Copied') : (no ? 'Kopier detaljer' : 'Copy details')}</button>
          </details>
        </div>
      )}
    </div>
  )
}
