'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type AppLanguage = 'en' | 'no'
export type PreviewPlan = 'trial' | 'basic' | 'normal' | 'pro'
type SubscriptionEntitlements = {
  effective_plan: 'basic' | 'normal' | 'pro'
  effective_status: string
  is_trial: boolean
  days_remaining_in_trial: number
}

export type SubscriptionPlan = {
  id: PreviewPlan
  name: string
  price: { en: string; no: string }
  priceSuffix?: { en: string; no: string }
  features: { en: string[]; no: string[] }
}

export const AI_FOLLOW_PLANS: SubscriptionPlan[] = [
  { id: 'trial', name: 'Trial', price: { en: 'Free for 30 days', no: 'Gratis i 30 dager' }, features: { en: ['Follow 1 thing', 'Radar included'], no: ['Følg 1 ting', 'Radar inkludert'] } },
  { id: 'basic', name: 'Basic', price: { en: '59 kr', no: '59 kr' }, priceSuffix: { en: 'per month', no: 'per måned' }, features: { en: ['Follow up to 2 things', 'Radar on 1 thing'], no: ['Følg opptil 2 ting', 'Radar på 1 ting'] } },
  { id: 'normal', name: 'Normal', price: { en: '119 kr', no: '119 kr' }, priceSuffix: { en: 'per month', no: 'per måned' }, features: { en: ['Follow up to 5 things', 'Radar on up to 2 things'], no: ['Følg opptil 5 ting', 'Radar på opptil 2 ting'] } },
  { id: 'pro', name: 'Pro', price: { en: '229 kr', no: '229 kr' }, priceSuffix: { en: 'per month', no: 'per måned' }, features: { en: ['Follow up to 10 things', 'Radar on up to 5 things'], no: ['Følg opptil 10 ting', 'Radar på opptil 5 ting'] } },
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
  const currentPlanDetails = AI_FOLLOW_PLANS.find((plan) => plan.id === currentPlan)
  const currentTitle = currentPlanDetails && (currentPlanDetails.id === 'trial' ? currentPlanDetails.price[language] : currentPlanDetails.name)

  return (
    <section className="settings-scroll h-full overflow-x-hidden overflow-y-auto pb-5" aria-labelledby="subscription-heading">
      <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 rounded-md text-sm text-[color:var(--fg-60)] outline-none transition hover:text-[color:var(--fg)] focus-visible:ring-2 focus-visible:ring-[#2aa3ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]">
        <span aria-hidden="true">←</span> {isNo ? 'Tilbake til Innstillinger' : 'Back to Settings'}
      </button>

      <header className="mb-6 max-w-3xl">
        <h2 id="subscription-heading" className="text-3xl font-semibold tracking-tight text-[color:var(--fg)]">{isNo ? 'Følg med på det som betyr noe for deg' : 'Follow anything that matters to you'}</h2>
        <p className="mt-3 text-sm leading-6 text-[color:var(--fg-65)]">{isNo ? 'Et produkt, en pris, en sak, et arrangement, en lansering – eller noe helt annet. RE:MIND følger med på viktige endringer og sier fra.' : 'A product, price, case, event, release—or something completely different. RE:MIND checks for meaningful changes and lets you know.'}</p>
        <p className="mt-2 text-sm leading-6 text-[color:var(--fg-65)]">{isNo ? 'Radar følger utvalgte ting tettere når tidspunktet er viktig.' : 'Radar checks selected things more closely when timing matters.'}</p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[color:var(--panel-05)] px-4 py-3" aria-live="polite">
        <span className="text-xs font-semibold text-[#2aa3ff]">{isNo ? 'Planforhåndsvisning' : 'Plan preview'}</span>
        <span className="text-xs text-[color:var(--fg-60)]">{isNo ? 'Bytt plan for å teste grensene. Ingen betaling gjennomføres.' : 'Switch plans to test limits. No payment is made.'}</span>
        <strong className="text-sm font-medium text-[color:var(--fg)]">{loading ? (isNo ? 'Laster…' : 'Loading…') : currentTitle || (isNo ? 'Ikke tilgjengelig' : 'Unavailable')}</strong>
        {entitlements?.is_trial && <span className="text-xs text-[color:var(--fg-60)]">{isNo ? `${entitlements.days_remaining_in_trial} dager igjen` : `${entitlements.days_remaining_in_trial} days remaining`}</span>}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {AI_FOLLOW_PLANS.map((plan) => {
          const selected = currentPlan === plan.id
          const popular = plan.id === 'normal'
          const previewLabel = plan.id === 'trial'
            ? (isNo ? 'Forhåndsvis prøveperiode' : 'Preview trial')
            : `${isNo ? 'Forhåndsvis' : 'Preview'} ${plan.name}`
          return (
            <article key={plan.id} aria-current={selected ? 'true' : undefined} className={`flex min-w-0 flex-col rounded-2xl p-5 ring-1 ring-inset transition-colors ${selected ? 'bg-[#2aa3ff]/[0.07] ring-[#2aa3ff]/70' : 'bg-[color:var(--panel-05)] ring-[color:var(--bd-10)]'}`}>
              <div className="flex min-h-6 items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-[color:var(--fg)]">{plan.name}</h3>
                {(selected || popular) && <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.11em] ${selected ? 'bg-[#2aa3ff] text-white' : 'bg-[#2aa3ff]/10 text-[#2aa3ff]'}`}>{selected ? (isNo ? 'Gjeldende' : 'Current') : (isNo ? 'Mest populær' : 'Most popular')}</span>}
              </div>
              <div className="mt-4 flex min-h-11 items-end gap-2">
                <span className={`${plan.id === 'trial' ? 'text-2xl' : 'text-3xl'} font-semibold leading-none tracking-tight text-[color:var(--fg)]`}>{plan.price[language]}</span>
                {plan.priceSuffix && <span className="pb-0.5 text-xs text-[color:var(--fg-60)]">{plan.priceSuffix[language]}</span>}
              </div>
              <ul className="mt-5 min-h-14 space-y-2 text-sm text-[color:var(--fg-70)]">
                {plan.features[language].map((feature) => <li key={feature} className="flex gap-2"><span aria-hidden="true" className="text-[#2aa3ff]">✓</span><span>{feature}</span></li>)}
              </ul>
              <button type="button" disabled={loading || !!switching || selected} onClick={() => switchPlan(plan.id)} className={`mt-5 w-full rounded-xl px-3 py-2.5 text-xs font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-[#2aa3ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)] disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'bg-[color:var(--bd-10)] text-[color:var(--fg-60)]' : 'bg-[#2aa3ff] text-white hover:bg-[#168fe5]'}`}>
                {switching === plan.id ? (isNo ? 'Bytter…' : 'Switching…') : selected ? (isNo ? 'Gjeldende plan' : 'Current plan') : previewLabel}
              </button>
            </article>
          )
        })}
      </div>
      {message && <p role="status" className="mt-4 text-sm text-[#2aa3ff]">{message}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-[color:var(--danger)]">{error}</p>}
    </section>
  )
}
