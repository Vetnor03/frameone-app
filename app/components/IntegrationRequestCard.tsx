'use client'

import { useState, type FormEvent } from 'react'
import { supabase } from '@/app/lib/supabase'
import AppSheet from './AppSheet'

type Language = 'en' | 'no'

export default function IntegrationRequestCard({ language }: { language: Language }) {
  const [open, setOpen] = useState(false)
  const [appName, setAppName] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [submittedName, setSubmittedName] = useState('')

  const t = language === 'no' ? {
    title: 'Savner du en app?',
    subtitle: 'Fortell oss hvilken app du ønsker å koble til RE:MIND.',
    request: 'FORESLÅ APP',
    modalTitle: 'Foreslå en integrasjon',
    modalSubtitle: 'Hvilken app ønsker du at RE:MIND skal støtte?',
    name: 'APPNAVN',
    namePlaceholder: 'Skriv inn navnet på appen',
    note: 'HVA ØNSKER DU Å BRUKE DEN TIL? (VALGFRITT)',
    notePlaceholder: 'F.eks. vise beskjeder eller avtaler på rammen',
    disclaimer: 'Vi vurderer forslagene når vi planlegger nye integrasjoner. Et forslag er ikke en garanti for støtte.',
    cancel: 'AVBRYT',
    send: 'SEND FORSLAG',
    sending: 'SENDER…',
    success: (name: string) => `Takk! Vi har mottatt forslaget ditt om ${name}.`,
    again: 'FORESLÅ EN TIL',
    invalid: 'Skriv navnet på appen (2–80 tegn).',
    already: 'Du har allerede foreslått denne appen. Takk!',
    limit: 'Du har sendt flere forslag i dag. Prøv igjen i morgen.',
    login: 'Logg inn for å sende et forslag.',
    failure: 'Kunne ikke sende forslaget. Prøv igjen.',
  } : {
    title: 'Missing an app?',
    subtitle: 'Tell us which app you would like to connect to RE:MIND.',
    request: 'REQUEST AN APP',
    modalTitle: 'Request an integration',
    modalSubtitle: 'Which app would you like RE:MIND to support?',
    name: 'APP NAME',
    namePlaceholder: 'Enter the app name',
    note: 'WHAT WOULD YOU USE IT FOR? (OPTIONAL)',
    notePlaceholder: 'e.g. show messages or appointments on the frame',
    disclaimer: 'We review suggestions when planning new integrations. Requests do not guarantee support.',
    cancel: 'CANCEL',
    send: 'SEND REQUEST',
    sending: 'SENDING…',
    success: (name: string) => `Thanks! We received your request for ${name}.`,
    again: 'REQUEST ANOTHER',
    invalid: 'Enter an app name (2–80 characters).',
    already: 'You have already requested this app. Thank you!',
    limit: 'You have sent several requests today. Please try again tomorrow.',
    login: 'Sign in to send a request.',
    failure: 'Could not send your request. Please try again.',
  }

  function close() {
    if (saving) return
    setOpen(false)
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const name = appName.trim().replace(/\s+/g, ' ')
    if (name.length < 2 || name.length > 80) {
      setError(t.invalid)
      return
    }
    setSaving(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError(t.login)
        return
      }
      const response = await fetch('/api/integrations/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ appName: name, note: note.trim() }),
      })
      if (response.status === 409) {
        setError(t.already)
        return
      }
      if (response.status === 429) {
        setError(t.limit)
        return
      }
      if (response.status === 401) {
        setError(t.login)
        return
      }
      if (!response.ok) throw new Error('Request failed')
      setSubmittedName(name)
      setAppName('')
      setNote('')
      setOpen(false)
    } catch {
      setError(t.failure)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="mt-4 rounded-2xl border border-dashed border-[color:var(--bd-20)] bg-[color:var(--panel-05)] px-4 py-4">
        <div className="text-sm font-medium text-[color:var(--fg-90)]">{t.title}</div>
        {submittedName ? (
          <div role="status" className="mt-1 text-xs leading-relaxed text-[color:var(--fg-65)]">{t.success(submittedName)}</div>
        ) : (
          <div className="mt-1 text-xs leading-relaxed text-[color:var(--fg-45)]">{t.subtitle}</div>
        )}
        <button
          type="button"
          onClick={() => { setError(''); setOpen(true) }}
          className="mt-3 h-9 rounded-xl border border-[color:var(--bd-20)] px-3 text-[11px] font-medium tracking-widest text-[color:var(--fg-80)]"
        >
          + {submittedName ? t.again : t.request}
        </button>
      </div>

      {open && (
        <AppSheet
          title={t.modalTitle}
          onClose={close}
          dismissible={!saving}
          footer={
            <div className="flex gap-2">
              <button type="button" onClick={close} disabled={saving} className="h-11 min-w-0 flex-1 rounded-2xl border border-[color:var(--bd-15)] text-xs tracking-widest text-[color:var(--fg-70)] disabled:opacity-50">{t.cancel}</button>
              <button type="submit" form="integration-request-form" disabled={saving || !appName.trim()} className="h-11 min-w-0 flex-1 rounded-2xl border border-[#2aa3ff] text-xs tracking-widest text-[#2aa3ff] disabled:opacity-50">{saving ? t.sending : t.send}</button>
            </div>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-[color:var(--fg-90)]">{t.modalTitle}</div>
              <p className="mt-1 text-xs leading-snug text-[color:var(--fg-45)]">{t.modalSubtitle}</p>
            </div>
            <button type="button" onClick={close} disabled={saving} aria-label={t.cancel} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--bd-15)] text-xl text-[color:var(--fg-60)] disabled:opacity-50">×</button>
          </div>
          <form id="integration-request-form" onSubmit={submit} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-[10px] tracking-widest text-[color:var(--fg-45)]">{t.name}</span>
              <input
                required minLength={2} maxLength={80} value={appName}
                onChange={(e) => setAppName(e.target.value)} placeholder={t.namePlaceholder}
                disabled={saving} autoComplete="off"
                className="mt-1 h-11 w-full rounded-2xl border border-[color:var(--bd-15)] bg-transparent px-3 text-base text-[color:var(--fg-90)] outline-none focus:border-[#2aa3ff] disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-widest text-[color:var(--fg-45)]">{t.note}</span>
              <textarea
                rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder={t.notePlaceholder} disabled={saving}
                className="mt-1 w-full resize-none rounded-2xl border border-[color:var(--bd-15)] bg-transparent px-3 py-3 text-base text-[color:var(--fg-90)] outline-none focus:border-[#2aa3ff] disabled:opacity-50"
              />
            </label>
            <p className="text-xs leading-relaxed text-[color:var(--fg-45)]">{t.disclaimer}</p>
            {error && <p role="alert" className="text-xs text-[#d94b4b]">{error}</p>}
          </form>
        </AppSheet>
      )}
    </>
  )
}
