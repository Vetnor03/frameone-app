'use client'

import { useRef, useState } from 'react'
import AppSheet from './AppSheet'
import { supabase } from '@/app/lib/supabase'
import type { AladhanPreview } from '@/app/lib/integrations/aladhan/preview.mjs'

type Language = 'no' | 'en'
type Selection = { city: string; asrMethod: 1 | 2; method: number; highLatitude: number }

const methods = [
  { id: 3, name: 'Muslim World League' },
  { id: 13, name: 'Diyanet' },
  { id: 12, name: 'UOIF' },
  { id: 2, name: 'ISNA' },
  { id: 4, name: 'Umm Al-Qura' },
]
const latitudeMethods = [
  { id: 3, no: 'Vinkelbasert', en: 'Angle based' },
  { id: 1, no: 'Halve natten', en: 'Middle of the night' },
  { id: 2, no: 'En syvendedel av natten', en: 'One seventh of the night' },
]
const names: Record<string, { no: string; en: string }> = {
  Fajr: { no: 'Fajr', en: 'Fajr' },
  Sunrise: { no: 'Soloppgang', en: 'Sunrise' },
  Dhuhr: { no: 'Dhuhr', en: 'Dhuhr' },
  Asr: { no: 'Asr', en: 'Asr' },
  Sunset: { no: 'Solnedgang', en: 'Sunset' },
  Maghrib: { no: 'Maghrib', en: 'Maghrib' },
  Isha: { no: 'Isha', en: 'Isha' },
}

export default function AladhanPreviewModal({
  language, onClose, onConnected, currentCity, currentAsrMethod, currentMethod, currentHighLatitude,
}: {
  language: Language
  onClose: () => void
  onConnected: (selection: Selection) => void
  currentCity?: string | null
  currentAsrMethod?: 1 | 2
  currentMethod?: number
  currentHighLatitude?: number
}) {
  const [city, setCity] = useState(currentCity || 'Stavanger')
  const [asrMethod, setAsrMethod] = useState<1 | 2>(currentAsrMethod || 1)
  const [method, setMethod] = useState(currentMethod || 3)
  const [highLatitude, setHighLatitude] = useState(currentHighLatitude || 3)
  const [advanced, setAdvanced] = useState(false)
  const [preview, setPreview] = useState<AladhanPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(0)
  const busy = loading || saving

  function clearPreview() {
    requestRef.current++
    setPreview(null)
    setError('')
    setLoading(false)
  }
  function onCityChange(nextCity: string) { clearPreview(); setCity(nextCity) }
  function close() {
    if (saving) return
    clearPreview()
    onClose()
  }

  async function authToken() {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) throw new Error(language === 'no' ? 'Logg inn for å koble til.' : 'Please sign in to connect.')
    return token
  }
  async function connect() {
    if (busy || city.trim().length < 2) return
    setSaving(true)
    setError('')
    try {
      const token = await authToken()
      const response = await fetch('/api/integrations/aladhan/connect', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: city.trim(), asrMethod, method, highLatitude }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Could not connect AlAdhan')
      onConnected({ city: json.city || city.trim(), asrMethod, method, highLatitude })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect AlAdhan')
    } finally {
      setSaving(false)
    }
  }

  async function showToday() {
    if (busy || city.trim().length < 2) return
    const requestId = ++requestRef.current
    setLoading(true)
    setPreview(null)
    setError('')
    try {
      const token = await authToken()
      const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' })
      const params = new URLSearchParams({
        city: city.trim(), date, asrMethod: String(asrMethod),
        method: String(method), highLatitude: String(highLatitude),
      })
      const response = await fetch('/api/integrations/aladhan/preview?' + params.toString(), {
        headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
      })
      const json = await response.json()
      if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Could not load prayer times')
      if (requestId === requestRef.current) setPreview(json as AladhanPreview)
    } catch (e) {
      if (requestId === requestRef.current) setError(e instanceof Error ? e.message : 'AlAdhan unavailable')
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }

  const inputClass = 'mt-2 h-12 w-full rounded-2xl border border-[color:var(--bd-15)] bg-[color:var(--panel-05)] px-4 text-base text-[color:var(--fg-90)]'
  const labelClass = 'block text-xs font-medium text-[color:var(--fg-70)]'

  return (
    <AppSheet
      title="AlAdhan"
      onClose={close}
      dismissible={!saving}
      footer={
        <button
          type="button"
          onClick={() => void connect()}
          disabled={busy || city.trim().length < 2}
          className="h-12 w-full rounded-2xl bg-[#2aa3ff] text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving
            ? (language === 'no' ? 'KOBLER TIL…' : 'CONNECTING…')
            : currentCity
              ? (language === 'no' ? 'LAGRE' : 'SAVE')
              : (language === 'no' ? 'KOBLE TIL' : 'CONNECT')}
        </button>
      }
    >
      <p className="text-sm leading-relaxed text-[color:var(--fg-70)]">
        {language === 'no'
          ? 'Velg sted og Asr-metode. Bønnetider, soloppgang, solnedgang og islamske merkedager legges automatisk til.'
          : 'Choose a city and Asr method. Prayer times, sunrise, sunset and Islamic occasions will be added automatically.'}
      </p>

      <div className="mt-6">
        <label htmlFor="aladhan-city" className={labelClass}>
          {language === 'no' ? 'By' : 'City'}
        </label>
        <input
          id="aladhan-city"
          type="text"
          autoComplete="address-level2"
          placeholder={language === 'no' ? 'Søk etter by i Norge' : 'Enter a Norwegian city'}
          className={inputClass}
          value={city}
          disabled={busy}
          onChange={event => onCityChange(event.target.value)}
        />
      </div>

      <fieldset className="mt-5">
        <legend className={labelClass}>{language === 'no' ? 'Asr-metode' : 'Asr method'}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([1, 2] as const).map(value => (
            <label
              key={value}
              className={
                'flex h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 text-sm ' +
                (asrMethod === value
                  ? 'border-[#2aa3ff] text-[#2aa3ff]'
                  : 'border-[color:var(--bd-15)] text-[color:var(--fg-70)]')
              }
            >
              <input
                type="radio"
                name="aladhan-asr"
                checked={asrMethod === value}
                disabled={busy}
                onChange={() => { clearPreview(); setAsrMethod(value) }}
              />
              {value === 1 ? 'Standard' : 'Hanafi'}
            </label>
          ))}
        </div>
      </fieldset>

      {currentCity && <button
        type="button"
        aria-expanded={advanced}
        onClick={() => setAdvanced(value => !value)}
        className="mt-5 flex w-full items-center justify-between border-t border-[color:var(--bd-10)] pt-4 text-left text-sm text-[color:var(--fg-60)]"
      >
        <span>{language === 'no' ? 'Juster beregningene' : 'Adjust calculations'}</span>
        <span aria-hidden="true">{advanced ? '−' : '+'}</span>
      </button>}

      {currentCity && advanced && (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="aladhan-method" className={labelClass}>
              {language === 'no' ? 'Beregningsmetode' : 'Calculation method'}
            </label>
            <select
              id="aladhan-method"
              className={inputClass}
              disabled={busy}
              value={method}
              onChange={event => { clearPreview(); setMethod(Number(event.target.value)) }}
            >
              {methods.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="aladhan-high-lat" className={labelClass}>
              {language === 'no' ? 'Justering for høye breddegrader' : 'High latitude adjustment'}
            </label>
            <select
              id="aladhan-high-lat"
              className={inputClass}
              disabled={busy}
              value={highLatitude}
              onChange={event => { clearPreview(); setHighLatitude(Number(event.target.value)) }}
            >
              {latitudeMethods.map(item => <option key={item.id} value={item.id}>{item[language]}</option>)}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void showToday()}
            disabled={busy || city.trim().length < 2}
            className="w-full rounded-2xl border border-[color:var(--bd-20)] px-4 py-3 text-sm text-[color:var(--fg-75)] disabled:opacity-50"
          >
            {loading
              ? (language === 'no' ? 'Henter…' : 'Loading…')
              : (language === 'no' ? 'Se dagens bønnetider' : 'Preview today’s times')}
          </button>

          {preview && (
            <div className="rounded-2xl border border-[color:var(--bd-15)] p-4">
              <p className="mb-3 text-sm font-medium text-[color:var(--fg-85)]">{preview.city} · {preview.date}</p>
              <div className="space-y-2">
                {preview.times.map(item => (
                  <div key={item.name} className="flex justify-between border-b border-[color:var(--bd-10)] pb-2 text-sm text-[color:var(--fg-80)]">
                    <span>{names[item.name]?.[language] || item.name}</span>
                    <span className="font-semibold tabular-nums">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-5 rounded-xl border border-[#d94b4b]/30 p-3 text-sm text-[#ff7a7a]">
          {error}
        </p>
      )}

      <p className="mt-5 text-xs leading-relaxed text-[color:var(--fg-45)]">
        {language === 'no'
          ? 'Eksperimentell integrasjon. AlAdhan beregner tidene, som kan avvike fra lokale moskeer og IRN.'
          : 'Experimental integration. AlAdhan calculates the times, which may differ from local mosques and IRN.'}
      </p>
    </AppSheet>
  )
}
