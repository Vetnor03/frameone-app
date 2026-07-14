'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type AppLanguage = 'en' | 'no'
type AssistantWatchStatus = 'active' | 'paused' | 'completed' | 'error'
type AssistantWatch = {
  id: string
  original_request: string
  title: string
  normalized_goal: string
  trigger_description: string
  frequency_minutes: number
  preferred_language: AppLanguage
  completion_condition: string | null
  frame_id: string | null
  show_on_frame: boolean
  status: AssistantWatchStatus
  last_checked_at: string | null
  interpretation_status?: 'pending' | 'complete' | 'failed'
  created_at: string
}
type AssistantUpdate = {
  id: string
  watch_id: string
  headline: string
  summary: string
  source_urls: unknown
  is_read: boolean
  dismissed_from_frame?: boolean
  created_at: string
}

const MAX_ASSISTANT_REQUEST_LENGTH = 1000

function assistantCopy(language: AppLanguage) {
  return language === 'no' ? {
    heading: 'KI-assistent',
    intro: 'Be RE:MIND holde øye med noe for deg. Nye endringer og oppdateringer samles her.',
    placeholder: 'Hva vil du at RE:MIND skal holde øye med?',
    examples: ['Følg med på endringer i en sak jeg er interessert i', 'Si fra når noe jeg venter på blir tilgjengelig', 'Hold øye med prisendringer på noe jeg vurderer å kjøpe'],
    button: 'La RE:MIND følge med',
    creating: 'RE:MIND begynner å følge med…',
    success: 'RE:MIND følger nå med.',
    onlyRelevant: 'Bare nye og relevante endringer vises.',
    tasks: 'Det RE:MIND følger med på',
    updates: 'Oppdateringer',
    emptyTasks: 'Spør RE:MIND om å holde øye med noe, så vises det her.',
    emptyUpdates: 'Nye endringer og oppdateringer vises her.',
    statuses: { active: 'Følger med', paused: 'Satt på pause', error: 'Trenger oppmerksomhet', completed: 'Avsluttet' } as Record<AssistantWatchStatus, string>,
    lastChecked: 'Sist sjekket', never: 'Ikke sjekket ennå', instruction: 'Instruksjon', saving: 'Lagrer…', deleting: 'Sletter…', confirmDelete: 'Slette denne Watchen? Historikk som er knyttet til den blir også slettet.', markUnread: 'Marker ulest', markAllRead: 'Marker alle lest', pause: 'Pause', resume: 'Fortsett', edit: 'Endre', delete: 'Slett', save: 'Lagre', cancel: 'Avbryt', markRead: 'Marker lest', source: 'Kilde', needsText: 'Skriv hva RE:MIND skal følge med på.', tooLong: 'Gjør forespørselen litt kortere.', friendlyError: 'Beklager, noe gikk galt. Prøv igjen om litt.', detailRequest: 'Det du spurte om', latest: 'Siste nytt', previous: 'Tidligere oppdateringer', dev: 'Utvikling', loading: 'Laster…'
  } : {
    heading: 'AI Assistant',
    intro: 'Ask RE:MIND to keep an eye on something for you. New changes and updates are collected here.',
    placeholder: 'What would you like RE:MIND to keep an eye on?',
    examples: ['Keep track of changes to something I care about', 'Tell me when something I am waiting for becomes available', 'Keep an eye on price changes for something I am considering buying'],
    button: 'Let RE:MIND follow along',
    creating: 'RE:MIND is starting to follow along…',
    success: 'RE:MIND is now following along.',
    onlyRelevant: 'Only new and relevant changes are shown.',
    tasks: 'What RE:MIND is following', updates: 'Updates', emptyTasks: 'Ask RE:MIND to keep an eye on something, and it appears here.', emptyUpdates: 'New changes and updates appear here.',
    statuses: { active: 'Following', paused: 'Paused', error: 'Needs attention', completed: 'Ended' } as Record<AssistantWatchStatus, string>,
    lastChecked: 'Last checked', never: 'Not checked yet', instruction: 'Instruction', saving: 'Saving…', deleting: 'Deleting…', confirmDelete: 'Delete this Watch? Its dependent history will also be deleted.', markUnread: 'Mark unread', markAllRead: 'Mark all read', pause: 'Pause', resume: 'Resume', edit: 'Edit', delete: 'Delete', save: 'Save', cancel: 'Cancel', markRead: 'Mark read', source: 'Source', needsText: 'Write what RE:MIND should keep an eye on.', tooLong: 'Please make the request a little shorter.', friendlyError: 'Sorry, something went wrong. Please try again soon.', detailRequest: 'Your request', latest: 'Latest update', previous: 'Previous updates', dev: 'Development', loading: 'Loading…'
  }
}

function normalizeAssistantRequest(request: string) {
  return request.trim().replace(/\s+/g, ' ')
}

function temporaryAssistantTitle(request: string) {
  const clean = normalizeAssistantRequest(request)
  return clean.length <= 58 ? clean : `${clean.slice(0, 55).trim()}…`
}

function isMeaningfulAssistantRequest(request: string) {
  const clean = normalizeAssistantRequest(request)
  return clean.length >= 8 && /[\p{L}\p{N}]/u.test(clean)
}

function friendlyAssistantTime(value: string | null, language: AppLanguage) {
  if (!value) return assistantCopy(language).never
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return assistantCopy(language).never
  return new Intl.DateTimeFormat(language === 'no' ? 'nb-NO' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function sourceUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.map((x) => typeof x === 'string' ? x : (x && typeof x === 'object' && 'url' in x ? (x as { url?: unknown }).url : null)).filter((x): x is string => typeof x === 'string' && /^https?:\/\//i.test(x)).slice(0, 3)
}

export default function AIAssistantTab({ language, activeDeviceId }: { language: AppLanguage; activeDeviceId: string | null }) {
  const c = assistantCopy(language)
  const [request, setRequest] = useState('')
  const [watches, setWatches] = useState<AssistantWatch[]>([])
  const [updates, setUpdates] = useState<AssistantUpdate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingRequest, setEditingRequest] = useState('')
  const [busyUpdateId, setBusyUpdateId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busyWatchId, setBusyWatchId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = watches.find((w) => w.id === selectedId) ?? watches[0] ?? null
  const updatesByWatch = useMemo(() => updates.filter((u) => u.watch_id === selected?.id), [updates, selected?.id])

  const loadAssistant = useCallback(async () => {
    setLoading(true)
    try {
      const [watchResult, updateResult] = await Promise.all([
        supabase.from('monitoring_watches').select('id,original_request,title,normalized_goal,trigger_description,frequency_minutes,preferred_language,completion_condition,frame_id,show_on_frame,status,last_checked_at,interpretation_status,created_at').order('created_at', { ascending: false }),
        supabase.from('monitoring_updates').select('id,watch_id,headline,summary,source_urls,is_read,dismissed_from_frame,created_at').order('created_at', { ascending: false }).limit(40),
      ])
      if (watchResult.error) throw watchResult.error
      if (updateResult.error) throw updateResult.error
      setWatches((watchResult.data ?? []) as unknown as AssistantWatch[])
      setUpdates((updateResult.data ?? []) as unknown as AssistantUpdate[])
      setError(null)
    } catch (e) {
      console.error('[ai-assistant:load-failed]', e)
      setError(c.friendlyError)
    } finally {
      setLoading(false)
    }
  }, [c.friendlyError])

  useEffect(() => { loadAssistant() }, [loadAssistant])

  function validateRequestText(value: string) {
    const clean = normalizeAssistantRequest(value)
    if (!isMeaningfulAssistantRequest(clean)) return { clean, error: c.needsText }
    if (clean.length > MAX_ASSISTANT_REQUEST_LENGTH) return { clean, error: c.tooLong }
    return { clean, error: null }
  }

  async function createWatch() {
    const validation = validateRequestText(request)
    if (validation.error) { setError(validation.error); return }
    setCreating(true); setError(null); setMessage(null)
    const { data, error } = await supabase.rpc('create_ai_assistant_watch', { p_original_request: validation.clean, p_frame_id: activeDeviceId })
    if (error) setError(c.friendlyError)
    else {
      setRequest('')
      setMessage(c.success)
      await loadAssistant()
      const createdId = Array.isArray(data) ? data[0]?.id ?? null : data?.id ?? null
      setSelectedId(createdId)
      if (createdId) window.setTimeout(() => { void loadAssistant() }, 3000)
    }
    setCreating(false)
  }

  async function editWatch(id: string) {
    if (busyWatchId) return
    const validation = validateRequestText(editingRequest)
    if (validation.error) { setError(validation.error); return }
    setBusyWatchId(id); setError(null); setMessage(null)
    const { error } = await supabase.rpc('update_ai_assistant_watch_request', {
      p_watch_id: id,
      p_original_request: validation.clean,
    })
    if (error) setError(c.friendlyError)
    else { setEditingId(null); await loadAssistant(); window.setTimeout(() => { void loadAssistant() }, 3000) }
    setBusyWatchId(null)
  }

  async function setWatchPaused(id: string, paused: boolean) {
    if (busyWatchId) return
    setBusyWatchId(id); setError(null); setMessage(null)
    const { error } = await supabase.rpc(paused ? 'pause_ai_assistant_watch' : 'resume_ai_assistant_watch', { p_watch_id: id })
    if (error) setError(c.friendlyError); else await loadAssistant()
    setBusyWatchId(null)
  }

  async function deleteWatch(id: string) {
    if (busyWatchId || !window.confirm(c.confirmDelete)) return
    setBusyWatchId(id); setError(null); setMessage(null)
    const { error } = await supabase.rpc('delete_ai_assistant_watch', { p_watch_id: id })
    if (error) setError(c.friendlyError)
    else { if (selectedId === id) setSelectedId(null); await loadAssistant() }
    setBusyWatchId(null)
  }

  async function markUpdate(id: string, patch: { is_read: boolean }) {
    if (busyUpdateId) return
    setBusyUpdateId(id); setError(null); setMessage(null)
    const { error } = await supabase.from('monitoring_updates').update(patch).eq('id', id)
    if (error) setError(c.friendlyError); else await loadAssistant()
    setBusyUpdateId(null)
  }

  async function markAllRead() {
    if (busyUpdateId) return
    setBusyUpdateId('all'); setError(null); setMessage(null)
    const ids = updates.filter((u) => !u.is_read).map((u) => u.id)
    if (ids.length === 0) { setBusyUpdateId(null); return }
    const { error } = await supabase.from('monitoring_updates').update({ is_read: true }).in('id', ids)
    if (error) setError(c.friendlyError); else await loadAssistant()
    setBusyUpdateId(null)
  }

  function openEditor(w: AssistantWatch) {
    setEditingId(w.id)
    setEditingRequest(w.original_request)
  }

  return <div className="h-full overflow-y-auto pb-8 pr-1 tab-scroll">
    <div className="rounded-[2rem] border border-[color:var(--bd-15)] bg-[color:var(--card-bg)]/70 p-5 shadow-sm">
      <p className="text-[11px] tracking-[0.24em] text-[#2aa3ff]">RE:MIND</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--fg-95)]">{c.heading}</h1>
      <p className="mt-3 text-sm leading-6 text-[color:var(--fg-70)]">{c.intro}</p>
      <textarea value={request} onChange={(e) => setRequest(e.target.value)} maxLength={MAX_ASSISTANT_REQUEST_LENGTH + 1} placeholder={c.placeholder} rows={4} className="mt-5 w-full resize-none rounded-3xl border border-[color:var(--bd-15)] bg-[color:var(--app-bg)]/70 p-4 text-base leading-6 text-[color:var(--fg-90)] outline-none focus:border-[#2aa3ff]" />
      <div className="mt-3 flex flex-wrap gap-2">{c.examples.map((ex) => <button key={ex} type="button" onClick={() => setRequest(ex)} className="max-w-full rounded-full border border-[color:var(--bd-15)] px-3 py-2 text-left text-[11px] leading-4 text-[color:var(--fg-70)] break-words">{ex}</button>)}</div>
      <button type="button" onClick={createWatch} disabled={creating} className="mt-5 h-12 w-full rounded-2xl border border-[#2aa3ff] bg-[#2aa3ff] text-sm font-semibold tracking-wide text-white disabled:opacity-60">{creating ? c.creating : c.button}</button>
      {message && <div className="mt-4 rounded-2xl border border-[#2aa3ff]/30 bg-[#2aa3ff]/10 p-4 text-sm text-[color:var(--fg-85)]"><strong>{message}</strong><div className="mt-1 break-words text-[color:var(--fg-65)]">{selected?.title}</div><div className="mt-1 break-words text-[color:var(--fg-65)]">{selected?.trigger_description}</div><div className="mt-2 text-[color:var(--fg-70)]">{c.onlyRelevant}</div></div>}
      {error && <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300"><span>{error}</span><button type="button" onClick={loadAssistant} className="shrink-0 rounded-full border border-red-300/50 px-3 py-1 text-xs">Retry</button></div>}
    </div>

    <section className="mt-6"><h2 className="text-xs font-semibold tracking-[0.22em] text-[color:var(--fg-55)]">{c.tasks}</h2>{loading ? <p className="mt-4 text-sm text-[color:var(--fg-55)]">{c.loading}</p> : watches.length === 0 ? <p className="mt-4 rounded-3xl border border-dashed border-[color:var(--bd-20)] p-5 text-sm text-[color:var(--fg-55)]">{c.emptyTasks}</p> : <div className="mt-3 space-y-3">{watches.map((w) => { const latest = updates.find((u) => u.watch_id === w.id); const busy = busyWatchId === w.id; return <article key={w.id} onClick={() => setSelectedId(w.id)} className={`rounded-3xl border p-4 ${selected?.id === w.id ? 'border-[#2aa3ff]/70' : 'border-[color:var(--bd-15)]'} bg-[color:var(--card-bg)]/55`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-base font-semibold text-[color:var(--fg-92)]">{w.title}</h3><p className="mt-1 break-words text-sm leading-5 text-[color:var(--fg-65)]">{w.trigger_description}</p></div><span className="shrink-0 rounded-full bg-[#2aa3ff]/10 px-2.5 py-1 text-[10px] text-[#2aa3ff]">{c.statuses[w.status]}</span></div><p className="mt-3 text-xs text-[color:var(--fg-45)]">{c.lastChecked}: {friendlyAssistantTime(w.last_checked_at, language)}</p>{latest && <p className="mt-2 break-words text-sm text-[color:var(--fg-70)]">{latest.headline}</p>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); setWatchPaused(w.id, w.status !== 'paused') }} className="rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs text-[color:var(--fg-70)] disabled:opacity-50">{busy ? c.loading : (w.status === 'paused' ? c.resume : c.pause)}</button><button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); openEditor(w) }} className="rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs text-[color:var(--fg-70)] disabled:opacity-50">{c.edit}</button><button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); deleteWatch(w.id) }} className="rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs text-[color:var(--fg-70)] disabled:opacity-50">{busy ? c.deleting : c.delete}</button></div>{editingId === w.id && <div onClick={(e) => e.stopPropagation()} className="mt-3 space-y-3 rounded-2xl border border-[color:var(--bd-15)] p-3"><label className="block text-xs text-[color:var(--fg-55)]">{c.instruction}<textarea value={editingRequest} maxLength={MAX_ASSISTANT_REQUEST_LENGTH + 1} onChange={(e) => setEditingRequest(e.target.value)} className="mt-1 w-full rounded-xl border border-[color:var(--bd-15)] bg-transparent p-2 text-sm text-[color:var(--fg-90)] outline-none" /></label><div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={() => editWatch(w.id)} className="rounded-full border border-[#2aa3ff] px-3 py-1.5 text-xs text-[#2aa3ff] disabled:opacity-50">{busy ? c.saving : c.save}</button><button type="button" disabled={busy} onClick={() => setEditingId(null)} className="rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs disabled:opacity-50">{c.cancel}</button></div></div>}</article>})}</div>}</section>

    <section className="mt-6"><div className="flex items-center justify-between gap-3"><h2 className="text-xs font-semibold tracking-[0.22em] text-[color:var(--fg-55)]">{c.updates}</h2><button type="button" disabled={busyUpdateId !== null || updates.every((u) => u.is_read)} onClick={markAllRead} className="rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs text-[color:var(--fg-70)] disabled:opacity-50">{c.markAllRead}</button></div>{updates.length === 0 ? <p className="mt-4 rounded-3xl border border-dashed border-[color:var(--bd-20)] p-5 text-sm text-[color:var(--fg-55)]">{c.emptyUpdates}</p> : <div className="mt-3 space-y-3">{updates.map((u) => <article key={u.id} className={`rounded-3xl border border-[color:var(--bd-15)] p-4 ${u.is_read ? 'opacity-70' : ''}`}><div className="flex items-start justify-between gap-3"><h3 className="break-words text-base font-semibold text-[color:var(--fg-92)]">{u.headline}</h3>{!u.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#2aa3ff]" />}</div><p className="mt-2 break-words text-sm leading-5 text-[color:var(--fg-70)]">{u.summary}</p><p className="mt-2 break-words text-xs text-[color:var(--fg-45)]">{friendlyAssistantTime(u.created_at, language)} · {watches.find((w) => w.id === u.watch_id)?.title}</p><div className="mt-3 flex flex-wrap gap-2">{sourceUrls(u.source_urls).map((url, i) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="max-w-full truncate rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs text-[#2aa3ff]">{c.source} {i + 1}</a>)}<button type="button" disabled={busyUpdateId !== null} onClick={() => markUpdate(u.id, { is_read: !u.is_read })} className="rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs text-[color:var(--fg-70)] disabled:opacity-50">{u.is_read ? c.markUnread : c.markRead}</button></div></article>)}</div>}</section>

    {selected && <section className="mt-6 rounded-[2rem] border border-[color:var(--bd-15)] p-5"><h2 className="break-words text-xs font-semibold tracking-[0.22em] text-[color:var(--fg-55)]">{selected.title}</h2><p className="mt-3 break-words text-sm text-[color:var(--fg-65)]"><strong>{c.detailRequest}:</strong> {selected.original_request}</p><p className="mt-2 text-sm text-[color:var(--fg-65)]">{c.statuses[selected.status]} · {c.lastChecked}: {friendlyAssistantTime(selected.last_checked_at, language)}</p><h3 className="mt-5 text-sm font-semibold text-[color:var(--fg-85)]">{c.latest}</h3>{updatesByWatch[0] ? <p className="mt-2 break-words text-sm text-[color:var(--fg-70)]">{updatesByWatch[0].headline} — {updatesByWatch[0].summary}</p> : <p className="mt-2 text-sm text-[color:var(--fg-50)]">{c.emptyUpdates}</p>}<h3 className="mt-5 text-sm font-semibold text-[color:var(--fg-85)]">{c.previous}</h3><div className="mt-2 space-y-2">{updatesByWatch.slice(1).map((u) => <p key={u.id} className="break-words text-sm text-[color:var(--fg-60)]">{u.headline}</p>)}</div></section>}

    {process.env.NODE_ENV !== 'production' && <section className="mt-6 rounded-3xl border border-dashed border-[color:var(--bd-20)] p-4"><h2 className="text-xs tracking-[0.22em] text-[color:var(--fg-50)]">{c.dev}</h2><div className="mt-3 grid grid-cols-2 gap-2">{['no change', 'new update', 'uncertain', 'error'].map((mode) => <button key={mode} onClick={() => setMessage(`Development result: ${mode}.`)} className="rounded-2xl border border-[color:var(--bd-15)] px-3 py-2 text-xs text-[color:var(--fg-65)]">{mode}</button>)}</div></section>}
  </div>
}
