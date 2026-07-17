'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type AppLanguage = 'en' | 'no'
type PreviewPlan = 'trial' | 'basic' | 'normal' | 'pro'
type SubscriptionEntitlements = {
  effective_plan: 'basic' | 'normal' | 'pro'
  effective_status: string
  is_trial: boolean
  days_remaining_in_trial: number
}

const PLANS: Array<{ id: PreviewPlan; price: { en: string; no: string }; features: { en: string[]; no: string[] } }> = [
  { id: 'trial', price: { en: 'Free trial', no: 'Gratis prøveperiode' }, features: { en: ['Up to 2 Watches', 'Radar on 1 Watch'], no: ['Opptil 2 følger', 'Radar på 1 følge'] } },
  { id: 'basic', price: { en: 'Basic — 59 kr/month', no: 'Basic — 59 kr/måned' }, features: { en: ['Up to 3 Watches'], no: ['Opptil 3 følger'] } },
  { id: 'normal', price: { en: 'Normal — 119 kr/month', no: 'Normal — 119 kr/måned' }, features: { en: ['Up to 5 Watches', 'Radar on 1 Watch'], no: ['Opptil 5 følger', 'Radar på 1 følge'] } },
  { id: 'pro', price: { en: 'Pro — 229 kr/month', no: 'Pro — 229 kr/måned' }, features: { en: ['Up to 10 Watches', 'Radar on up to 5 Watches'], no: ['Opptil 10 følger', 'Radar på opptil 5 følger'] } },
]

export default function SubscriptionSettingsPage({ language, onBack }: { language: AppLanguage; onBack: () => void }) {
  const isNo = language === 'no'
  const [entitlements, setEntitlements] = useState<SubscriptionEntitlements | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState<PreviewPlan | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadEntitlements = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    const userId = authData.user?.id
    if (!userId) throw new Error('not_authenticated')
    const { data, error: rpcError } = await supabase.rpc('get_ai_subscription_entitlements', { p_user_id: userId }).maybeSingle()
    if (rpcError) throw rpcError
    setEntitlements(data as SubscriptionEntitlements)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    loadEntitlements().catch(() => {
      if (active) setError(isNo ? 'Kunne ikke laste abonnementet.' : 'Could not load subscription.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [isNo, loadEntitlements])

  async function switchPlan(plan: PreviewPlan) {
    if (switching) return
    setSwitching(plan)
    setMessage(null)
    setError(null)
    try {
      const { error: previewError } = await supabase.rpc('preview_ai_subscription_plan', { p_plan: plan })
      if (previewError) throw previewError
      await loadEntitlements()
      setMessage(isNo ? 'Forhåndsvisningen er oppdatert.' : 'Development preview updated.')
    } catch {
      setError(isNo ? 'Kunne ikke bytte forhåndsvisning. Prøv igjen.' : 'Could not switch the preview. Please try again.')
    } finally {
      setSwitching(null)
    }
  }

  const currentPlan: PreviewPlan | null = entitlements ? (entitlements.is_trial ? 'trial' : entitlements.effective_plan) : null
  const currentTitle = PLANS.find((plan) => plan.id === currentPlan)?.price[language]

  return (
    <section className="settings-scroll h-full overflow-y-auto pb-5" aria-labelledby="subscription-heading">
      <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm text-[color:var(--fg-60)] hover:text-[color:var(--fg)]">
        <span aria-hidden="true">←</span> {isNo ? 'Tilbake til Innstillinger' : 'Back to Settings'}
      </button>

      <div className="mb-5 rounded-3xl border border-[#2aa3ff]/50 bg-[#2aa3ff]/10 p-5">
        <div id="subscription-heading" className="text-[10px] uppercase tracking-[0.24em] text-[#2aa3ff]">{isNo ? 'Gjeldende abonnement' : 'Current plan'}</div>
        <h2 className="mt-2 text-2xl font-medium text-[color:var(--fg)]">{loading ? (isNo ? 'Laster…' : 'Loading…') : currentTitle || (isNo ? 'Ikke tilgjengelig' : 'Unavailable')}</h2>
        {entitlements?.is_trial && <p className="mt-2 text-sm text-[color:var(--fg-70)]">{isNo ? `${entitlements.days_remaining_in_trial} dager igjen av prøveperioden` : `${entitlements.days_remaining_in_trial} trial days remaining`}</p>}
      </div>

      <div className="mb-5 border-y border-[color:var(--bd-10)] py-3 text-xs leading-5 text-[color:var(--fg-60)]">
        <strong className="block uppercase tracking-[0.16em] text-[color:var(--fg-80)]">{isNo ? 'Midlertidig utviklingsforhåndsvisning' : 'Temporary development preview'}</strong>
        {isNo ? 'Bytt plan for testing. Dette gjennomfører ingen betaling.' : 'Switch plans for testing. No payment is made.'}
      </div>

      <div className="space-y-3">
        <p className="text-sm leading-5 text-[color:var(--fg-65)]">{isNo ? 'Radar følger ekstra godt med på utvalgte følger, slik at du holder deg oppdatert.' : 'Radar keeps a closer eye on selected Watches, so you stay up to speed.'}</p>
        {PLANS.map((plan) => {
          const selected = currentPlan === plan.id
          return <article key={plan.id} className={`rounded-2xl border p-4 transition ${selected ? 'border-[#2aa3ff] bg-[#2aa3ff]/10' : 'border-[color:var(--bd-10)] bg-[color:var(--panel-05)]'}`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-medium text-[color:var(--fg)]">{plan.price[language]}</h3>
              {selected && <span className="rounded-full bg-[#2aa3ff] px-2.5 py-1 text-[9px] uppercase tracking-widest text-white">{isNo ? 'Gjeldende' : 'Current'}</span>}
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-[color:var(--fg-70)]">{plan.features[language].map((feature) => <li key={feature}>• {feature}</li>)}</ul>
            <button type="button" disabled={loading || !!switching || selected} onClick={() => switchPlan(plan.id)} className="mt-4 w-full rounded-xl border border-[color:var(--bd-20)] px-3 py-2.5 text-xs uppercase tracking-[0.14em] text-[color:var(--fg-70)] disabled:cursor-not-allowed disabled:opacity-45">
              {switching === plan.id ? (isNo ? 'Bytter…' : 'Switching…') : selected ? (isNo ? 'Gjeldende plan' : 'Current plan') : (isNo ? 'Forhåndsvis denne planen' : 'Preview this plan')}
            </button>
          </article>
        })}
      </div>
      {message && <p role="status" className="mt-4 text-sm text-[#2aa3ff]">{message}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-[color:var(--danger)]">{error}</p>}
    </section>
  )
}
