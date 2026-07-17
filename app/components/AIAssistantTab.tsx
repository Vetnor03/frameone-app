'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { selectNewestUnreadUpdates } from '../lib/aiAssistantUpdates'

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
  is_instant: boolean
  owner_user_id: string
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

type AssistantEntitlements = { effective_plan: 'basic' | 'normal' | 'pro'; effective_status: string; is_trial: boolean; days_remaining_in_trial: number; monitoring_enabled: boolean; max_ongoing_watches: number; max_instant_watches: number; can_use_instant: boolean; instant_check_interval_minutes: number | null }
const MAX_ASSISTANT_REQUEST_LENGTH = 1000
const ONGOING_ASSISTANT_WATCH_STATUSES: AssistantWatchStatus[] = ['active', 'paused', 'error']

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
    updates: 'Oppdateringer', instant: 'Radar', instantDescription: 'Radar følger ekstra godt med, slik at du holder deg oppdatert.', instantUnavailable: 'Radar er ikke tilgjengelig med dette abonnementet.', instantLimitReached: 'Radar er allerede fullt brukt på abonnementet ditt.', instantOwnerOnly: 'Bare eieren kan slå Radar av eller på.', turnOnInstant: 'Slå på Radar', turnOffInstant: 'Slå av Radar',
    emptyTasks: 'Spør RE:MIND om å holde øye med noe, så vises det her.',
    emptyUpdates: 'Nye endringer og oppdateringer vises her.',
    statuses: { active: 'Følger med', paused: 'Satt på pause', error: 'Trenger oppmerksomhet', completed: 'Avsluttet' } as Record<AssistantWatchStatus, string>,
    lastChecked: 'Sist sjekket', never: 'Ikke sjekket ennå', instruction: 'Instruksjon', saving: 'Lagrer…', deleting: 'Sletter…', confirmDelete: 'Slette denne tingen? Historikk som er knyttet til den blir også slettet.', markUnread: 'Marker ulest', markAllRead: 'Marker alle lest', pause: 'Pause', resume: 'Fortsett', edit: 'Endre', delete: 'Slett', save: 'Lagre', cancel: 'Avbryt', markRead: 'Marker lest', source: 'Kilde', needsText: 'Skriv hva RE:MIND skal følge med på.', tooLong: 'Gjør forespørselen litt kortere.', friendlyError: 'Beklager, noe gikk galt. Prøv igjen om litt.', detailRequest: 'Det du spurte om', latest: 'Siste nytt', previous: 'Tidligere oppdateringer', dev: 'Utvikling', loading: 'Laster…', following: 'Følges', usage: (count: number, max: number) => `${count} av ${max}`, trialDays: (days: number) => days === 1 ? '1 dag igjen' : `${days} dager igjen`, fullPlan: 'Abonnementet ditt er fullt. Bytt plan for å følge flere ting.', subscriptionRequired: 'Abonnementet ditt tillater ikke aktiv overvåking akkurat nå.', trial: 'Gratis prøveperiode'
  } : {
    heading: 'AI Assistant',
    intro: 'Ask RE:MIND to keep an eye on something for you. New changes and updates are collected here.',
    placeholder: 'What would you like RE:MIND to keep an eye on?',
    examples: ['Keep track of changes to something I care about', 'Tell me when something I am waiting for becomes available', 'Keep an eye on price changes for something I am considering buying'],
    button: 'Let RE:MIND follow along',
    creating: 'RE:MIND is starting to follow along…',
    success: 'RE:MIND is now following along.',
    onlyRelevant: 'Only new and relevant changes are shown.',
    tasks: 'What RE:MIND is following', updates: 'Updates', instant: 'Radar', instantDescription: 'Radar keeps a closer eye on selected things, so you stay up to speed.', instantUnavailable: 'Radar is not available on this plan.', instantLimitReached: 'Radar is already fully used on your plan.', instantOwnerOnly: 'Only the owner can turn Radar on or off.', turnOnInstant: 'Turn on Radar', turnOffInstant: 'Turn off Radar', emptyTasks: 'Ask RE:MIND to keep an eye on something, and it appears here.', emptyUpdates: 'New changes and updates appear here.',
    statuses: { active: 'Following', paused: 'Paused', error: 'Needs attention', completed: 'Ended' } as Record<AssistantWatchStatus, string>,
    lastChecked: 'Last checked', never: 'Not checked yet', instruction: 'Instruction', saving: 'Saving…', deleting: 'Deleting…', confirmDelete: 'Delete this thing? Its dependent history will also be deleted.', markUnread: 'Mark unread', markAllRead: 'Mark all read', pause: 'Pause', resume: 'Resume', edit: 'Edit', delete: 'Delete', save: 'Save', cancel: 'Cancel', markRead: 'Mark read', source: 'Source', needsText: 'Write what RE:MIND should keep an eye on.', tooLong: 'Please make the request a little shorter.', friendlyError: 'Sorry, something went wrong. Please try again soon.', detailRequest: 'Your request', latest: 'Latest update', previous: 'Previous updates', dev: 'Development', loading: 'Loading…', following: 'Following', usage: (count: number, max: number) => `${count} of ${max}`, trialDays: (days: number) => days === 1 ? '1 day left' : `${days} days left`, fullPlan: 'Your current plan is full. Change plan to follow more things.', subscriptionRequired: 'Your subscription does not currently allow active monitoring.', trial: 'Free trial'
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [hasCreatedWatch, setHasCreatedWatch] = useState<boolean | null>(null)
  const [entitlements, setEntitlements] = useState<AssistantEntitlements | null>(null)

  const ownedOngoingWatchCount = useMemo(() => watches.filter((w) => w.owner_user_id === currentUserId && ONGOING_ASSISTANT_WATCH_STATUSES.includes(w.status)).length, [watches, currentUserId])
  const ownedInstantWatchCount = useMemo(() => watches.filter((w) => w.owner_user_id === currentUserId && w.is_instant && ONGOING_ASSISTANT_WATCH_STATUSES.includes(w.status)).length, [watches, currentUserId])
  const reachedWatchLimit = !entitlements?.monitoring_enabled || (entitlements != null && ownedOngoingWatchCount >= entitlements.max_ongoing_watches)
  const planIsFull = entitlements != null && ownedOngoingWatchCount >= entitlements.max_ongoing_watches
  const selected = watches.find((w) => w.id === selectedId) ?? watches[0] ?? null
  const updatesByWatch = useMemo(() => updates.filter((u) => u.watch_id === selected?.id), [updates, selected?.id])
  const inboxUpdates = useMemo(() => selectNewestUnreadUpdates(updates), [updates])

  const loadAssistant = useCallback(async () => {
    setLoading(true)
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      const userId = userData.user?.id ?? null
      if (!userId) throw new Error('not_authenticated')

      const [watchResult, updateResult, onboardingResult, entitlementResult] = await Promise.all([
        supabase.from('monitoring_watches').select('id,owner_user_id,original_request,title,normalized_goal,trigger_description,frequency_minutes,preferred_language,completion_condition,frame_id,show_on_frame,status,is_instant,last_checked_at,interpretation_status,created_at').order('created_at', { ascending: false }),
        supabase.from('monitoring_updates').select('id,watch_id,headline,summary,source_urls,is_read,dismissed_from_frame,created_at').order('created_at', { ascending: false }),
        supabase.from('user_onboarding_state').select('has_created_watch').eq('user_id', userId).maybeSingle(),
        supabase.rpc('get_ai_subscription_entitlements', { p_user_id: userId }).maybeSingle(),
      ])
      if (watchResult.error) throw watchResult.error
      if (updateResult.error) throw updateResult.error
      if (onboardingResult.error) throw onboardingResult.error
      setCurrentUserId(userId)
      setEntitlements(entitlementResult.error ? null : entitlementResult.data as AssistantEntitlements)
      setHasCreatedWatch(onboardingResult.data?.has_created_watch === true)
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
    if (reachedWatchLimit) { if (!entitlements?.monitoring_enabled) setError(c.subscriptionRequired); return }
    setCreating(true); setError(null); setMessage(null)
    const { data, error } = await supabase.rpc('create_ai_assistant_watch', { p_original_request: validation.clean, p_frame_id: activeDeviceId })
    if (error != null) {
      if (error.message === 'watch_limit_reached' || error.code === 'watch_limit_reached' || error.message?.includes('watch_limit_reached')) {
        console.warn('[ai-assistant:watch-limit-reached]', { code: error.code, message: error.message, ownedOngoingWatchCount })
        setMessage(c.fullPlan)
      } else if (error.message?.includes('subscription_required')) {
        setError(c.subscriptionRequired)
      } else {
        console.error('[ai-assistant:create-failed]', { code: error.code, message: error.message, ownedOngoingWatchCount })
        setError(c.friendlyError)
      }
    } else {
      setHasCreatedWatch(true)
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
    try {
      const { error } = await supabase.rpc('update_ai_assistant_watch_request', {
        p_watch_id: id,
        p_original_request: validation.clean,
      })
      if (error) {
        console.error('[ai-assistant:watch-edit-failed]', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          watchId: id,
        })
        setError(c.friendlyError)
        return
      }
      setEditingId(null)
      setSelectedId(id)
      setMessage(c.success)
      await loadAssistant()
    } catch (e) {
      console.error('[ai-assistant:watch-edit-failed]', { watchId: id, error: e })
      setError(c.friendlyError)
    } finally {
      setBusyWatchId(null)
    }
  }

  async function setWatchPaused(id: string, paused: boolean) {
    if (busyWatchId) return
    setBusyWatchId(id); setError(null); setMessage(null)
    const { error } = await supabase.rpc(paused ? 'pause_ai_assistant_watch' : 'resume_ai_assistant_watch', { p_watch_id: id })
    if (error) setError(c.friendlyError); else await loadAssistant()
    setBusyWatchId(null)
  }

  async function setWatchInstant(watch: AssistantWatch, enabled: boolean) {
    if (busyWatchId) return
    setBusyWatchId(watch.id); setError(null); setMessage(null)
    const { error } = await supabase.rpc('set_ai_assistant_watch_instant', { p_watch_id: watch.id, p_is_instant: enabled })
    if (error) {
      const stableError = `${error.code || ''} ${error.message || ''}`
      if (stableError.includes('instant_watch_limit_reached')) setError(c.instantLimitReached)
      else if (stableError.includes('instant_not_available')) setError(c.instantUnavailable)
      else if (stableError.includes('subscription_required')) setError(c.subscriptionRequired)
      else if (stableError.includes('watch_not_found_or_not_owned')) setError(c.instantOwnerOnly)
      else setError(c.friendlyError)
    } else await loadAssistant()
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
    const previousUpdates = updates
    setUpdates((current) => current.map((update) => update.id === id ? { ...update, ...patch } : update))
    const { error } = await supabase.from('monitoring_updates').update(patch).eq('id', id)
    if (error) { setUpdates(previousUpdates); setError(c.friendlyError) } else await loadAssistant()
    setBusyUpdateId(null)
  }

  async function markAllRead() {
    if (busyUpdateId) return
    setBusyUpdateId('all'); setError(null); setMessage(null)
    const ids = inboxUpdates.map((u) => u.id)
    if (ids.length === 0) { setBusyUpdateId(null); return }
    const previousUpdates = updates
    setUpdates((current) => current.map((update) => ids.includes(update.id) ? { ...update, is_read: true } : update))
    const { error } = await supabase.from('monitoring_updates').update({ is_read: true }).in('id', ids)
    if (error) { setUpdates(previousUpdates); setError(c.friendlyError) } else await loadAssistant()
    setBusyUpdateId(null)
  }

  function openEditor(w: AssistantWatch) {
    setEditingId(w.id)
    setEditingRequest(w.original_request)
  }

  const planLabel = entitlements?.is_trial ? c.trial : entitlements ? `${entitlements.effective_plan[0].toUpperCase()}${entitlements.effective_plan.slice(1)}` : ''
  const trialDays = Math.max(0, Math.min(30, entitlements?.days_remaining_in_trial ?? 0))
  const trialUrgency = trialDays <= 1 ? 'font-semibold text-amber-400' : trialDays <= 3 ? 'text-amber-300' : 'text-[color:var(--fg-55)]'
  const meterWidth = (count: number, allowance: number) => allowance <= 0 ? 0 : Math.min(100, Math.max(0, count / allowance * 100))

  return <div className="h-full overflow-y-auto pb-8 pr-1 tab-scroll">
    <div className="rounded-[2rem] border border-[color:var(--bd-15)] bg-[color:var(--card-bg)]/70 p-5 shadow-sm">
      <p className="text-[11px] tracking-[0.24em] text-[#2aa3ff]">RE:MIND</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--fg-95)]">{c.heading}</h1>
      <p className="mt-3 text-sm leading-6 text-[color:var(--fg-70)]">{c.intro}</p>
      <textarea value={request} onChange={(e) => setRequest(e.target.value)} maxLength={MAX_ASSISTANT_REQUEST_LENGTH + 1} placeholder={c.placeholder} rows={4} className="mt-5 w-full resize-none rounded-3xl border border-[color:var(--bd-15)] bg-[color:var(--app-bg)]/70 p-4 text-base leading-6 text-[color:var(--fg-90)] outline-none focus:border-[#2aa3ff]" />
      {!loading && hasCreatedWatch === false && <div className="mt-3 flex flex-wrap gap-2">{c.examples.map((ex) => <button key={ex} type="button" onClick={() => setRequest(ex)} className="max-w-full rounded-full border border-[color:var(--bd-15)] px-3 py-2 text-left text-[11px] leading-4 text-[color:var(--fg-70)] break-words">{ex}</button>)}</div>}
      <div data-testid="assistant-usage-summary" className="mt-4 rounded-2xl border border-[color:var(--bd-15)] bg-[color:var(--app-bg)]/45 p-3">
        <div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium text-[color:var(--fg-85)]">{planLabel || c.loading}</span>{entitlements?.is_trial && <span className={trialUrgency}>{c.trialDays(trialDays)}</span>}</div>
        {entitlements?.is_trial && <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-[color:var(--fg-15)]" aria-hidden="true"><div className="h-full bg-[#2aa3ff]" style={{ width: `${meterWidth(30 - trialDays, 30)}%` }} /></div>}
        {entitlements && <div className="mt-3 grid grid-cols-2 gap-4">
          {([[c.following, ownedOngoingWatchCount, entitlements.max_ongoing_watches], [c.instant, ownedInstantWatchCount, entitlements.max_instant_watches]] as const).map(([label, count, allowance]) => <div key={label}>
            <div className="flex items-baseline justify-between gap-2 text-xs"><span className="text-[color:var(--fg-60)]">{label}</span><span className="font-medium tabular-nums text-[color:var(--fg-85)]">{c.usage(count, allowance)}</span></div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[color:var(--fg-15)]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={allowance} aria-valuenow={Math.min(count, allowance)}><div className="h-full bg-[#2aa3ff]" style={{ width: `${meterWidth(count, allowance)}%` }} /></div>
          </div>)}
        </div>}
      </div>
      <button type="button" onClick={createWatch} disabled={creating || reachedWatchLimit} aria-disabled={creating || reachedWatchLimit} className="mt-3 h-12 w-full rounded-2xl border border-[#2aa3ff] bg-[#2aa3ff] text-sm font-semibold tracking-wide text-white disabled:cursor-not-allowed disabled:border-[color:var(--bd-20)] disabled:bg-[color:var(--fg-35)] disabled:opacity-60">{creating ? c.creating : c.button}</button>
      {planIsFull && <p className="mt-2 text-center text-xs text-[color:var(--fg-55)]">{c.fullPlan}</p>}
      {message && <div className="mt-4 rounded-2xl border border-[#2aa3ff]/30 bg-[#2aa3ff]/10 p-4 text-sm text-[color:var(--fg-85)]"><strong>{message}</strong><div className="mt-1 break-words text-[color:var(--fg-65)]">{selected?.title}</div><div className="mt-1 break-words text-[color:var(--fg-65)]">{selected?.trigger_description}</div><div className="mt-2 text-[color:var(--fg-70)]">{c.onlyRelevant}</div></div>}
      {error && <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300"><span>{error}</span><button type="button" onClick={loadAssistant} className="shrink-0 rounded-full border border-red-300/50 px-3 py-1 text-xs">Retry</button></div>}
    </div>

    <section className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-[0.22em] text-[color:var(--fg-55)]">{c.tasks}</h2>
      </div>
      {loading ? <p className="mt-4 text-sm text-[color:var(--fg-55)]">{c.loading}</p> : watches.length === 0 ? <p className="mt-4 rounded-3xl border border-dashed border-[color:var(--bd-20)] p-5 text-sm text-[color:var(--fg-55)]">{c.emptyTasks}</p> : <div className="mt-3 space-y-3">{watches.map((w) => {
        const latest = updates.find((u) => u.watch_id === w.id)
        const busy = busyWatchId === w.id
        const canManageWatch = currentUserId === w.owner_user_id
        const instantSlotsFull = !!entitlements && ownedInstantWatchCount >= entitlements.max_instant_watches
        const cannotEnableInstant = !entitlements?.can_use_instant || instantSlotsFull || !ONGOING_ASSISTANT_WATCH_STATUSES.includes(w.status)
        return <article key={w.id} onClick={() => setSelectedId(w.id)} className={`rounded-3xl border p-4 ${selected?.id === w.id ? 'border-[#2aa3ff]/70' : 'border-[color:var(--bd-15)]'} bg-[color:var(--card-bg)]/55`}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-base font-semibold text-[color:var(--fg-92)]">{w.title}</h3>{w.is_instant && <span className="rounded-full bg-[#2aa3ff]/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#2aa3ff]">{c.instant}</span>}</div><p className="mt-1 break-words text-sm leading-5 text-[color:var(--fg-65)]">{w.trigger_description}</p></div><span className="shrink-0 rounded-full bg-[#2aa3ff]/10 px-2.5 py-1 text-[10px] text-[#2aa3ff]">{c.statuses[w.status]}</span></div>
          <p className="mt-3 text-xs text-[color:var(--fg-45)]">{c.lastChecked}: {friendlyAssistantTime(w.last_checked_at, language)}</p>
          {latest && <p className="mt-2 break-words text-sm text-[color:var(--fg-70)]">{latest.headline}</p>}
          {canManageWatch && <div onClick={(e) => e.stopPropagation()} className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--bd-15)] p-3">
            <div><div className="text-sm font-medium text-[color:var(--fg-85)]">{c.instant}</div><div className="text-xs text-[color:var(--fg-50)]">{c.instantDescription}</div></div>
            <button type="button" role="switch" aria-checked={w.is_instant} aria-label={`${w.is_instant ? c.turnOffInstant : c.turnOnInstant}: ${w.title}`} disabled={busy || (!w.is_instant && cannotEnableInstant)} title={!w.is_instant && cannotEnableInstant ? (entitlements?.can_use_instant ? c.instantLimitReached : c.instantUnavailable) : (w.is_instant ? c.turnOffInstant : c.turnOnInstant)} onClick={() => setWatchInstant(w, !w.is_instant)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${w.is_instant ? 'bg-[#2aa3ff]' : 'bg-[color:var(--fg-25)]'} disabled:cursor-not-allowed disabled:opacity-45`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${w.is_instant ? 'left-6' : 'left-1'}`} /></button>
          </div>}
          {canManageWatch && <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); setWatchPaused(w.id, w.status !== 'paused') }} className="rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs text-[color:var(--fg-70)] disabled:opacity-50">{busy ? c.loading : (w.status === 'paused' ? c.resume : c.pause)}</button><button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); openEditor(w) }} className="rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs text-[color:var(--fg-70)] disabled:opacity-50">{c.edit}</button><button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); deleteWatch(w.id) }} className="rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs text-[color:var(--fg-70)] disabled:opacity-50">{busy ? c.deleting : c.delete}</button></div>}
          {canManageWatch && editingId === w.id && <div onClick={(e) => e.stopPropagation()} className="mt-3 space-y-3 rounded-2xl border border-[color:var(--bd-15)] p-3"><label className="block text-xs text-[color:var(--fg-55)]">{c.instruction}<textarea value={editingRequest} maxLength={MAX_ASSISTANT_REQUEST_LENGTH + 1} onChange={(e) => setEditingRequest(e.target.value)} className="mt-1 w-full rounded-xl border border-[color:var(--bd-15)] bg-transparent p-2 text-sm text-[color:var(--fg-90)] outline-none" /></label><div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={() => editWatch(w.id)} className="rounded-full border border-[#2aa3ff] px-3 py-1.5 text-xs text-[#2aa3ff] disabled:opacity-50">{busy ? c.saving : c.save}</button><button type="button" disabled={busy} onClick={() => setEditingId(null)} className="rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs disabled:opacity-50">{c.cancel}</button></div></div>}
        </article>
      })}</div>}
    </section>

    <section className="mt-6"><div className="flex items-center justify-between gap-3"><h2 className="text-xs font-semibold tracking-[0.22em] text-[color:var(--fg-55)]">{c.updates}</h2><button type="button" disabled={busyUpdateId !== null || inboxUpdates.length === 0} onClick={markAllRead} className="rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs text-[color:var(--fg-70)] disabled:opacity-50">{c.markAllRead}</button></div>{inboxUpdates.length === 0 ? <p className="mt-4 rounded-3xl border border-dashed border-[color:var(--bd-20)] p-5 text-sm text-[color:var(--fg-55)]">{c.emptyUpdates}</p> : <div className="mt-3 space-y-3">{inboxUpdates.map((u) => <article key={u.id} className={`rounded-3xl border border-[color:var(--bd-15)] p-4 ${u.is_read ? 'opacity-70' : ''}`}><div className="flex items-start justify-between gap-3"><h3 className="break-words text-base font-semibold text-[color:var(--fg-92)]">{u.headline}</h3>{!u.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#2aa3ff]" />}</div><p className="mt-2 break-words text-sm leading-5 text-[color:var(--fg-70)]">{u.summary}</p><p className="mt-2 break-words text-xs text-[color:var(--fg-45)]">{friendlyAssistantTime(u.created_at, language)} · {watches.find((w) => w.id === u.watch_id)?.title}</p><div className="mt-3 flex flex-wrap gap-2">{sourceUrls(u.source_urls).map((url, i) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="max-w-full truncate rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs text-[#2aa3ff]">{c.source} {i + 1}</a>)}<button type="button" disabled={busyUpdateId !== null} onClick={() => markUpdate(u.id, { is_read: !u.is_read })} className="rounded-full border border-[color:var(--bd-20)] px-3 py-1.5 text-xs text-[color:var(--fg-70)] disabled:opacity-50">{u.is_read ? c.markUnread : c.markRead}</button></div></article>)}</div>}</section>

    {selected && <section className="mt-6 rounded-[2rem] border border-[color:var(--bd-15)] p-5"><h2 className="break-words text-xs font-semibold tracking-[0.22em] text-[color:var(--fg-55)]">{selected.title}</h2><p className="mt-3 break-words text-sm text-[color:var(--fg-65)]"><strong>{c.detailRequest}:</strong> {selected.original_request}</p><p className="mt-2 text-sm text-[color:var(--fg-65)]">{c.statuses[selected.status]} · {c.lastChecked}: {friendlyAssistantTime(selected.last_checked_at, language)}</p><h3 className="mt-5 text-sm font-semibold text-[color:var(--fg-85)]">{c.latest}</h3>{updatesByWatch[0] ? <p className="mt-2 break-words text-sm text-[color:var(--fg-70)]">{updatesByWatch[0].headline} — {updatesByWatch[0].summary}</p> : <p className="mt-2 text-sm text-[color:var(--fg-50)]">{c.emptyUpdates}</p>}<h3 className="mt-5 text-sm font-semibold text-[color:var(--fg-85)]">{c.previous}</h3><div className="mt-2 space-y-2">{updatesByWatch.slice(1).map((u) => <p key={u.id} className="break-words text-sm text-[color:var(--fg-60)]">{u.headline}</p>)}</div></section>}

    {process.env.NODE_ENV !== 'production' && <section className="mt-6 rounded-3xl border border-dashed border-[color:var(--bd-20)] p-4"><h2 className="text-xs tracking-[0.22em] text-[color:var(--fg-50)]">{c.dev}</h2><div className="mt-3 grid grid-cols-2 gap-2">{['no change', 'new update', 'uncertain', 'error'].map((mode) => <button key={mode} onClick={() => setMessage(`Development result: ${mode}.`)} className="rounded-2xl border border-[color:var(--bd-15)] px-3 py-2 text-xs text-[color:var(--fg-65)]">{mode}</button>)}</div></section>}
  </div>
}
