'use client'

import { useEffect, useMemo, useState } from 'react'
import AppSheet from './AppSheet'
import { supabase } from '@/app/lib/supabase'

type City = { id: string; name: string }

export default function BonnetidSetupModal({ language, currentCity, currentAsrMethod, onClose, onSaved }: {
  language: 'en' | 'no'
  currentCity?: string | null
  currentAsrMethod?: 1 | 2
  onClose: () => void
  onSaved: (connected: boolean, city: string, asrMethod: 1 | 2) => void
}) {
  const [cities, setCities] = useState<City[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<City | null>(null)
  const [asrMethod, setAsrMethod] = useState<1 | 2 | null>(currentCity ? currentAsrMethod || 2 : null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const filtered = useMemo(() => cities.filter(city => city.name.toLocaleLowerCase('nb-NO').includes(query.trim().toLocaleLowerCase('nb-NO'))).slice(0, 60), [cities, query])

  useEffect(() => {
    let alive = true
    void (async () => {
      setLoading(true); setError('')
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token
        if (!token) throw new Error(language === 'no' ? 'Logg inn for å velge by.' : 'Sign in to choose a city.')
        const response = await fetch('/api/integrations/bonnetid/locations', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'Could not load cities')
        if (alive) setCities(Array.isArray(json.cities) ? json.cities : [])
      } catch (err) { if (alive) setError(err instanceof Error ? err.message : 'Bønnetid unavailable') }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [retry, language])

  async function connect() {
    if (!selected || !asrMethod || saving) return
    setSaving(true); setError('')
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) throw new Error('Sign in to connect Bønnetid')
      const response = await fetch('/api/integrations/bonnetid/connect', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cityId: selected.id, asrMethod }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not connect Bønnetid')
      onSaved(true, json.city || selected.name, asrMethod)
      onClose()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not connect Bønnetid') }
    finally { setSaving(false) }
  }

  return (
    <AppSheet
      title="Bønnetid"
      onClose={onClose}
      dismissible={!saving}
      footer={<button type="button" onClick={connect} disabled={!selected || !asrMethod || saving || loading} className="h-11 w-full rounded-2xl border border-[#2aa3ff] text-xs tracking-widest text-[#2aa3ff] disabled:opacity-40">
        {saving ? (language === 'no' ? 'KOBLER TIL…' : 'CONNECTING…') : (language === 'no' ? 'KOBLE TIL' : 'CONNECT')}
      </button>}
    >
      <p className="text-sm text-[color:var(--fg-60)]">
        {language === 'no' ? 'Velg byen din for å vise de kommende bønnetidene under Bønn i Påminnelser.' : 'Choose your city to show upcoming prayer times under Prayer in Reminders.'}
      </p>
      {currentCity && <p className="mt-2 text-xs text-[color:var(--fg-45)]">{language === 'no' ? 'Nåværende by' : 'Current city'}: {currentCity}</p>}
      <label htmlFor="bonnetid-city-search" className="mt-5 block text-[10px] tracking-widest text-[color:var(--fg-45)]">{language === 'no' ? 'VELG BY' : 'CHOOSE CITY'}</label>
      <input id="bonnetid-city-search" value={query} onChange={event => { setQuery(event.target.value); setSelected(null) }} placeholder={language === 'no' ? 'Søk etter by' : 'Search for a city'} className="mt-2 h-11 w-full rounded-2xl border border-[color:var(--bd-15)] bg-transparent px-3 text-base" />
      {loading ? <p className="mt-3 text-xs text-[color:var(--fg-45)]">{language === 'no' ? 'Henter byer…' : 'Loading cities…'}</p> : (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-[color:var(--bd-15)]">
          {filtered.map(city => <button key={city.id} type="button" onClick={() => { setSelected(city); setQuery(city.name) }} className={'block w-full border-b border-[color:var(--bd-10)] px-3 py-3 text-left text-sm last:border-b-0 ' + (selected?.id === city.id ? 'text-[#2aa3ff]' : 'text-[color:var(--fg-80)]')}>{city.name}</button>)}
          {!filtered.length && !error && <p className="px-3 py-4 text-xs text-[color:var(--fg-45)]">{language === 'no' ? 'Ingen byer funnet' : 'No cities found'}</p>}
        </div>
      )}
      <fieldset className="mt-5">
        <legend className="block text-[10px] tracking-widest text-[color:var(--fg-45)]">{language === 'no' ? 'ASR-METODE' : 'ASR METHOD'}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([1, 2] as const).map(method => (
            <label key={method} className={'flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-3 text-sm ' + (asrMethod === method ? 'border-[#2aa3ff] text-[#2aa3ff]' : 'border-[color:var(--bd-15)] text-[color:var(--fg-70)]')}>
              <input type="radio" name="bonnetid-asr" checked={asrMethod === method} onChange={() => setAsrMethod(method)} />
              {method}x
            </label>
          ))}
        </div>
      </fieldset>
      {error && <div role="alert" className="mt-3 rounded-xl bg-[#d94b4b]/10 p-3 text-xs text-[#ff7a7a]">{error}{!saving && <button type="button" onClick={() => setRetry(value => value + 1)} className="ml-2 underline">{language === 'no' ? 'Prøv igjen' : 'Retry'}</button>}</div>}
      <p className="mt-3 text-xs text-[color:var(--fg-45)]">{language === 'no' ? 'Eksperimentell integrasjon · tider fra Islamsk Råd Norge' : 'Experimental integration · times from Islamsk Råd Norge'}</p>
    </AppSheet>
  )
}
