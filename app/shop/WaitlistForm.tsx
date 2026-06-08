'use client'

import { useState, type FormEvent } from 'react'

declare global {
  interface Window {
    va?: (event: 'event', name: string, data?: Record<string, string>) => void
  }
}

type WaitlistFormProps = {
  compact?: boolean
  productInterest?: string
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error'

export default function WaitlistForm({ compact = false, productInterest = 'RE:MIND-enheten' }: WaitlistFormProps) {
  const [status, setStatus] = useState<FormStatus>('idle')
  const [message, setMessage] = useState('')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const email = String(formData.get('email') || '').trim()
    const name = String(formData.get('name') || '').trim()
    const product = String(formData.get('product_interest') || productInterest).trim()

    if (!email) {
      setStatus('error')
      setMessage('Skriv inn e-postadressen din.')
      return
    }

    setStatus('submitting')
    setMessage('')

    const response = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: name || null, product_interest: product || null, source: 'shop' }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Kunne ikke melde deg på akkurat nå.' }))
      setStatus('error')
      setMessage(payload.error || 'Kunne ikke melde deg på akkurat nå.')
      return
    }

    window.va?.('event', 'waitlist_signup', { source: 'shop', product_interest: product || 'unknown' })
    form.reset()
    setStatus('success')
    setMessage('Takk! Du er nå på ventelisten.')
  }

  return (
    <form onSubmit={onSubmit} className={compact ? 'space-y-3' : 'grid gap-3 sm:grid-cols-[1fr_1fr_auto]'}>
      <input
        className="min-h-11 rounded border border-black/15 bg-white px-4 py-3 text-sm outline-none transition focus:border-black/45"
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="E-postadresse"
        aria-label="E-postadresse"
      />
      <input
        className="min-h-11 rounded border border-black/15 bg-white px-4 py-3 text-sm outline-none transition focus:border-black/45"
        type="text"
        name="name"
        autoComplete="name"
        placeholder="Navn (valgfritt)"
        aria-label="Navn valgfritt"
      />
      <input type="hidden" name="product_interest" value={productInterest} />
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="shop-button min-h-11 rounded bg-black px-7 py-3 text-sm font-medium tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'submitting' ? 'Melder på…' : 'Bli med på ventelisten'}
      </button>
      {message ? (
        <p className={`text-sm ${status === 'success' ? 'text-emerald-700' : 'text-red-700'} ${compact ? '' : 'sm:col-span-3'}`} role="status">
          {message}
        </p>
      ) : null}
    </form>
  )
}
