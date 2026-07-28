'use client'

import { track } from '@vercel/analytics'
import { useState } from 'react'
import type { FormEvent } from 'react'

type NewsletterResponse = {
  error?: string
}

export default function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim()) return

    setStatus('submitting')
    setMessage('')

    const response = await fetch('/api/shop/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), source: 'shop-footer' }),
    }).catch(() => null)

    const result = response
      ? ((await response.json().catch(() => null)) as NewsletterResponse | null)
      : null

    if (!response?.ok) {
      setStatus('error')
      setMessage(result?.error || 'Something went wrong. Please try again.')
      return
    }

    track('newsletter_signup', { source: 'shop-footer', page: window.location.pathname })
    setStatus('success')
    setMessage('Thank you for joining our newsletter! Please check your inbox.')
    setEmail('')
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 w-full max-w-[320px] min-w-0">
      <div className="flex w-full max-w-full min-w-0 overflow-hidden rounded border border-black/15">
        <label htmlFor="footer-newsletter-email" className="sr-only">Email address</label>
        <input
          id="footer-newsletter-email"
          className="w-full min-w-0 max-w-full bg-white px-3 py-2 outline-none"
          placeholder="Your email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={status === 'submitting'}
          required
        />
        <button
          className="bg-black px-3 text-white disabled:opacity-60"
          type="submit"
          aria-label="Sign up for the newsletter"
          disabled={status === 'submitting'}
        >
          {status === 'submitting' ? '…' : '→'}
        </button>
      </div>
      {message ? (
        <p
          className={`mt-2 text-xs leading-[1.4] ${status === 'error' ? 'text-red-700' : 'text-black/60'}`}
          role={status === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
    </form>
  )
}
