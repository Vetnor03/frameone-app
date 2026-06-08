'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'

type Props = {
  compact?: boolean
  source?: string
}

type VercelAnalyticsWindow = Window & {
  va?: (event: 'event', name: string, data?: Record<string, string>) => void
}

export default function WaitlistForm({ compact = false, source = 'shop' }: Props) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim()) return

    setStatus('submitting')
    setMessage('')

    const response = await fetch('/api/shop/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), name: name.trim() || null, source }),
    }).catch(() => null)

    if (!response) {
      setStatus('error')
      setMessage('Something went wrong. Please try again.')
      return
    }

    const result = await response.json().catch(() => null)

    if (!response.ok) {
      setStatus('error')
      setMessage(result?.error || 'Something went wrong. Please try again.')
      return
    }

    ;(window as VercelAnalyticsWindow).va?.('event', 'waitlist_signup', { source })
    setStatus('success')
    setMessage('Thank you! You are now on the RE:MIND waitlist.')
    setEmail('')
    setName('')
  }

  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="mt-3 w-full max-w-[320px]">
        <div className="flex overflow-hidden rounded border border-black/15">
          <input
            className="w-full bg-white px-3 py-2 outline-none"
            placeholder="Your email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <button className="bg-black px-3 text-white" type="submit" disabled={status === 'submitting'}>
            →
          </button>
        </div>
        {message ? <p className="mt-2 text-xs leading-[1.4] text-black/60">{message}</p> : null}
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 grid w-full gap-3 md:mt-0">
      <div className="mb-1">
        <h3 className="text-[18px] font-medium leading-[1.2] tracking-[-0.01em] text-black/85">Join the waitlist</h3>
        <p className="mt-2 max-w-[48ch] text-[13px] leading-[1.55] text-black/55">
          Be among the first to hear about RE:MIND and get access to launch updates and introductory pricing.
        </p>
      </div>
      <input
        className="w-full rounded border border-black/15 bg-white px-4 py-3 text-sm outline-none"
        placeholder="Name (optional)"
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <input
        className="w-full rounded border border-black/15 bg-white px-4 py-3 text-sm outline-none"
        placeholder="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <button className="shop-button w-full rounded bg-black px-7 py-3 text-sm text-white" type="submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Joining...' : 'Join Waitlist'}
      </button>
      <p className="text-center text-xs leading-[1.4] text-black/45">No commitment. No spam.</p>
      {message ? (
        <p className={`text-sm leading-[1.4] ${status === 'error' ? 'text-red-700' : 'text-black/65'}`}>
          {message}
        </p>
      ) : null}
    </form>
  )
}
