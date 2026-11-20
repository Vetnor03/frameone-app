'use client'

import { useEffect, useMemo, useState } from 'react'
import AppSheet from './AppSheet'
import { supabase } from '@/app/lib/supabase'

type City = { id: string; name: string }

export default function BonnetidSetupModal({ language, currentCity, onClose, onSaved }: {
  language: 'en' | 'no'
  currentCity?: string | null
  onClose: () => void
  onSaved: (connected: boolean, city: string) => void
}) {
  const [cities, setCities] = useState<City[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<City | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const filtered = useMemo(() =>
    cities.filter(city => city.name.toLocaleLowerCase('nb-NO').includes(query.trim().toLocaleLowerCase('nb-NO'))).slice(0, 60),
    [cities, query])

  // The selected city is the canonical visible value. Never keep the typing
  // fragment alongside it (e.g. "erStavanger" from late mobile input events).
  const visibleCity = selected?.name ?? query
  function selectCity(city: City) {
    setSelected(city)
    setQuery('')
  }
  function editCity() {
    setSelected(null)
    setQuery('')
  }

  useEffect(() => {
    let alive = true
    void (async () => {
      setLoading(true); setError('')
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token
        if (!token) throw new Error(language === 'no' ? 'Logg inn for å velge lokasjon.' : 'Sign in to choose a location.')
        const response = await fetch('/api/integrations/bonnetid/locations', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'Could not load locations')
        if (alive) setCities(Array.isArray(json.cities) ? json.cities : [])
      } catch (err) { if (alive) setError(err instanceof Error ? err.message : 'IRN unavailable') }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [retry, language])

  async function connect() {
    if (!selected || saving) return
    setSaving(true); setError('')
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) throw new Error('Sign in to connect IRN')
      const response = await fetch('/api/integrations/bonnetid/connect', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cityId: selected.id }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not connect IRN')
      onSaved(true, selected.name)
      onClose()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not connect IRN') }
    finally { setSaving(false) }
  }

  return (
    <AppSheet
      title="IRN – Bønnetid"
      onClose={onClose}
      dismissible={!saving}
      footer={<button type="button" onClick={connect} disabled={!selected || saving || loading} className="h-11 w-full rounded-2xl border border-[#2aa3ff] text-xs tracking-widest text-[#2aa3ff] disabled:opacity-40">
        {saving ? (language === 'no' ? 'KOBLER TIL…' : 'CONNECTING…') : (language === 'no' ? 'KOBLE TIL' : 'CONNECT')}
      </button>}
    >
      <p className="text-sm text-[color:var(--fg-60)]">
        {language === 'no'
          ? 'Velg lokasjonen din. IRN bestemmer riktig beregningsmetode, og bønnetidene vises i Påminnelser og på rammen.'
          : 'Choose your location. IRN supplies the prayer calculation method and times for Reminders and your frame.'}
      </p>
      {currentCity && <p className="mt-2 text-xs text-[color:var(--fg-45)]">{language === 'no' ? 'Nåværende lokasjon' : 'Current location'}: {currentCity}</p>}
      <label htmlFor="bonnetid-city-search" className="mt-5 block text-[10px] tracking-widest text-[color:var(--fg-45)]">{language === 'no' ? 'VELG LOKASJON' : 'CHOOSE LOCATION'}</label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id="bonnetid-city-search"
          type="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          readOnly={!!selected}
          value={visibleCity}
          onChange={event => { if (!selected) setQuery(event.target.value) }}
          placeholder={language === 'no' ? 'Søk etter kommune' : 'Search for a municipality'}
          className="h-11 min-w-0 flex-1 rounded-2xl border border-[color:var(--bd-15)] bg-transparent px-3 text-base"
        />
        {selected && (
          <button type="button" onClick={editCity} className="shrink-0 rounded-xl border border-[color:var(--bd-15)] px-3 py-3 text-xs text-[color:var(--fg-70)]">
            {language === 'no' ? 'ENDRE' : 'CHANGE'}
          </button>
        )}
      </div>
      {!selected && (loading ? <p className="mt-3 text-xs text-[color:var(--fg-45)]">{language === 'no' ? 'Henter lokasjoner…' : 'Loading locations…'}</p> : (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-[color:var(--bd-15)]">
          {filtered.map(city => <button key={city.id} type="button" onClick={() => selectCity(city)} className="block w-full border-b border-[color:var(--bd-10)] px-3 py-3 text-left text-sm text-[color:var(--fg-80)] last:border-b-0">{city.name}</button>)}
          {!filtered.length && !error && <p className="px-3 py-4 text-xs text-[color:var(--fg-45)]">{language === 'no' ? 'Ingen lokasjoner funnet' : 'No locations found'}</p>}
        </div>
      ))}
      {error && <div role="alert" className="mt-3 rounded-xl bg-[#d94b4b]/10 p-3 text-xs text-[#ff7a7a]">{error}{!saving && <button type="button" onClick={() => setRetry(value => value + 1)} className="ml-2 underline">{language === 'no' ? 'Prøv igjen' : 'Retry'}</button>}</div>}
      <p className="mt-3 text-xs text-[color:var(--fg-45)]">{language === 'no' ? 'Offisielle bønnetider og merkedager fra IRN' : 'Official prayer times and occasions from IRN'}</p>
    </AppSheet>
  )
}
