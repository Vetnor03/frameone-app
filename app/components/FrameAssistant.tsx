'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/app/lib/supabase'
import { assistantPlaceholder, nextAssistantTip } from '@/app/lib/assistant/tips'
import type { AssistantDestination, AssistantResult } from '@/app/lib/assistant/types'
import { isAppTheme, type AppTheme } from '@/app/lib/theme'
import { trackProductEvent } from '@/app/lib/productAnalytics.mjs'

export default function FrameAssistant({ deviceId, language, tipsEnabled, tipsShown, tipsLoaded, canSelectTip, assistantVisitId, onTipShown, onNavigate, onAppThemeChange }: { deviceId: string | null; language: 'en' | 'no'; tipsEnabled: boolean; tipsShown: number[]; tipsLoaded: boolean; canSelectTip: boolean; assistantVisitId: number; onTipShown: (index: number) => void | Promise<void>; onNavigate: (destination: AssistantDestination) => void; onAppThemeChange: (theme: AppTheme) => void }) {
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AssistantResult | null>(null), [tipDismissed, setTipDismissed] = useState(false)
  const [sessionTip, setSessionTip] = useState<ReturnType<typeof nextAssistantTip>>(null)
  const tipSelected = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const tip = tipsEnabled && !tipDismissed ? sessionTip : null
  const copy = language === 'no' ? { heading: 'RE:MIND-ASSISTENT', subtitle: 'Korte kommandoer, direkte resultat.', send: 'SEND', working: 'Jobber…' } : { heading: 'RE:MIND ASSISTANT', subtitle: 'Short commands, direct results.', send: 'SEND', working: 'Working…' }
  const placeholder = assistantPlaceholder(sessionTip?.id, language)
  useEffect(() => {
    setSessionTip(null)
    setTipDismissed(false)
    tipSelected.current = false
  }, [assistantVisitId])

  useEffect(() => {
    if (!tipsLoaded || !tipsEnabled || !canSelectTip || tipSelected.current) return
    tipSelected.current = true
    const selected = nextAssistantTip(tipsShown, language)
    setSessionTip(selected)
    if (selected) onTipShown(selected.index)
  }, [canSelectTip, language, onTipShown, tipsEnabled, tipsLoaded, tipsShown])

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  function cancelCloseTimer() {
    if (!closeTimer.current) return
    clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!text.trim() || !deviceId || busy) return
    setBusy(true); setResult(null)
    try {
      const { data } = await supabase.auth.getSession()
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token || ''}` }, body: JSON.stringify({ text: text.trim(), deviceId, language, localNow: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null, ...(pendingId ? { pendingId } : {}) }) })
      const value = await response.json().catch(() => null)
      const outcome = value?.status === 'completed' ? 'completed' : value?.status === 'needs_input' ? 'needs_input' : value?.status === 'unsupported' ? 'unsupported' : 'error'
      trackProductEvent({ event: `assistant_request_${outcome}` as 'assistant_request_completed'|'assistant_request_needs_input'|'assistant_request_unsupported'|'assistant_request_error', surface: 'assistant', metadata: value?.analytics })
      if (outcome === 'completed' && value?.action === 'create_reminder' && typeof value?.analytics?.recurring === 'boolean') trackProductEvent({ event: 'reminder_created', surface: 'reminders', source: 'assistant', metadata: { recurring: value.analytics.recurring } })
      setResult(value && typeof value.message === 'string' ? value : { status: 'error', message: "I couldn't do that. Try again." })
      setPendingId(value?.status === 'needs_input' && typeof value.pendingId === 'string' ? value.pendingId : null)
      if (value?.status === 'needs_input' || value?.status === 'completed') setText('')
      if (value?.status === 'completed') {
        if (isAppTheme(value.appTheme)) onAppThemeChange(value.appTheme)
        if (value.action === 'create_reminder') {
          cancelCloseTimer()
          closeTimer.current = setTimeout(() => {
            setOpen(false)
            setResult(null)
            setPendingId(null)
            setText('')
            closeTimer.current = null
          }, 750)
        }
      }
    } catch { trackProductEvent({ event: 'assistant_request_error', surface: 'assistant', metadata: { outcome: 'error', errorType: 'network' } }); setResult({ status: 'error', message: "I couldn't do that. Try again." }) } finally { setBusy(false) }
  }

  return <div className="pointer-events-none absolute bottom-[104px] right-1 z-40 flex flex-col items-end">
    {tip && !open && <div role="status" className="pointer-events-auto mb-3 flex max-w-[245px] items-start gap-2 rounded-2xl border border-[color:var(--bd-15)] bg-[color:var(--sheet-bg)] px-3 py-2 text-xs text-[color:var(--fg-70)] shadow-xl"><span>{tip.text}</span><button aria-label="Dismiss assistant tip" onClick={() => setTipDismissed(true)}>✕</button></div>}
    <button type="button" aria-label="Open RE:MIND Assistant" onClick={() => { cancelCloseTimer(); setOpen(true); setTipDismissed(true); trackProductEvent({ event: 'assistant_opened', surface: 'frame' }) }} className="pointer-events-auto grid h-12 w-12 place-items-center rounded-2xl border border-[color:var(--bd-20)] bg-[color:var(--sheet-bg)] text-[color:var(--fg-80)] shadow-[0_10px_30px_rgba(0,0,0,.22)]"><span className="text-sm tracking-[-.12em]">R:</span></button>
    {open && <div role="dialog" aria-label="RE:MIND Assistant" className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <section className="w-full max-w-[420px] rounded-t-3xl border-t border-[color:var(--bd-10)] bg-[color:var(--sheet-bg)] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5">
        <div className="flex items-center justify-between"><div><h2 className="text-sm tracking-widest text-[color:var(--fg-80)]">{copy.heading}</h2><p className="mt-1 text-xs text-[color:var(--fg-50)]">{copy.subtitle}</p></div><button aria-label="Close assistant" onClick={() => { cancelCloseTimer(); setOpen(false) }} className="h-9 w-9 text-xl text-[color:var(--fg-60)]">✕</button></div>
        {busy && <div role="status" aria-live="polite" className="mt-5 rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] p-4 text-sm text-[color:var(--fg-60)]"><span className="inline-block animate-pulse">{copy.working}</span></div>}
        {result && <div aria-live="polite" className="mt-5 rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] p-4 text-sm text-[color:var(--fg-80)]">{result.message}{result.cta && <button onClick={() => { setOpen(false); onNavigate(result.cta!.destination) }} className="mt-3 block text-xs tracking-widest text-[#2aa3ff]">{result.cta.label}</button>}</div>}
        <form onSubmit={submit} className="mt-5 flex gap-2"><input autoFocus value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} placeholder={placeholder} className="h-12 min-w-0 flex-1 rounded-2xl border border-[color:var(--bd-15)] bg-[color:var(--app-bg)] px-4 text-sm outline-none"/><button disabled={busy || !text.trim() || !deviceId} className="h-12 rounded-2xl border border-[#2aa3ff] px-4 text-xs tracking-widest text-[#2aa3ff] disabled:opacity-40">{busy ? '…' : copy.send}</button></form>
      </section>
    </div>}
  </div>
}
