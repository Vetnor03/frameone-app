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

export default function WaitlistForm({ compact = false, productInterest = 'RE:MIND Display' }: WaitlistFormProps) {
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
      setMessage('Enter your email address.')
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
      const payload = await response.json().catch(() => ({ error: 'Could not join the waitlist right now.' }))
      setStatus('error')
      setMessage(payload.error || 'Could not join the waitlist right now.')
      return
    }

    window.va?.('event', 'waitlist_signup', { source: 'shop', product_interest: product || 'unknown' })
    form.reset()
    setStatus('success')
    setMessage("Thanks! You're now on the waitlist.")
  }

  return (
    <form onSubmit={onSubmit} className={compact ? 'space-y-3' : 'grid gap-3 sm:grid-cols-[1fr_1fr_auto]'}>
      <input
        className="min-h-11 rounded border border-black/15 bg-white px-4 py-3 text-sm outline-none transition focus:border-black/45"
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="Email address"
        aria-label="Email address"
      />
      <input
        className="min-h-11 rounded border border-black/15 bg-white px-4 py-3 text-sm outline-none transition focus:border-black/45"
        type="text"
        name="name"
        autoComplete="name"
        placeholder="Name (optional)"
        aria-label="Name optional"
      />
      <input type="hidden" name="product_interest" value={productInterest} />
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="shop-button min-h-11 rounded bg-black px-7 py-3 text-sm font-medium tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'submitting' ? 'Joining…' : 'Join waitlist'}
      </button>
      {message ? (
        <p className={`text-sm ${status === 'success' ? 'text-emerald-700' : 'text-red-700'} ${compact ? '' : 'sm:col-span-3'}`} role="status">
          {message}
        </p>
      ) : null}
    </form>
  )
}
