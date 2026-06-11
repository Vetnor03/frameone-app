'use client'

import { track } from '@vercel/analytics'
import { useState } from 'react'
import type { FormEvent } from 'react'

type Props = {
  compact?: boolean
  source?: string
  page?: string
  heading?: string
  intro?: string
  buttonText?: string
  helperText?: string
  successMessage?: string
  formClassName?: string
  namePlaceholder?: string
  emailPlaceholder?: string
  compactEmailPlaceholder?: string
  submittingText?: string
  genericErrorMessage?: string
}

type WaitlistSignupResponse = {
  signup?: {
    waitlist_number?: number | null
  }
  error?: string
}

export default function WaitlistForm({
  compact = false,
  source = 'shop',
  page = '/shop',
  heading = 'Early access waitlist open',
  intro = 'Be among the first to follow the RE:MIND journey, get launch updates, and access early introductory pricing.',
  buttonText = 'Join Waitlist',
  helperText = 'No commitment. No spam.',
  successMessage = 'Thank you! You are now on the RE:MIND waitlist.',
  formClassName = 'mt-7 md:mt-0',
  namePlaceholder = 'Name (optional)',
  emailPlaceholder = 'Email',
  compactEmailPlaceholder = 'Your email',
  submittingText = 'Joining...',
  genericErrorMessage = 'Something went wrong. Please try again.',
}: Props) {
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
      setMessage(genericErrorMessage)
      return
    }

    const result = (await response.json().catch(() => null)) as WaitlistSignupResponse | null

    if (!response.ok) {
      setStatus('error')
      setMessage(result?.error || genericErrorMessage)
      return
    }

    track('waitlist_signup', {
      source,
      page,
    })
    setStatus('success')
    setMessage(successMessage)
    setEmail('')
    setName('')
  }

  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="mt-3 w-full max-w-[320px] min-w-0">
        <div className="flex w-full max-w-full min-w-0 overflow-hidden rounded border border-black/15">
          <input
            className="w-full min-w-0 max-w-full bg-white px-3 py-2 outline-none"
            placeholder={compactEmailPlaceholder}
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
    <form onSubmit={handleSubmit} className={`${formClassName} grid w-full max-w-full min-w-0 gap-3`}>
      <div className="mb-1">
        <h3 className="text-[18px] font-medium leading-[1.2] tracking-[-0.01em] text-black/85">{heading}</h3>
        {intro ? (
          <p className="mt-2 max-w-[48ch] text-[13px] leading-[1.55] text-black/55">
            {intro}
          </p>
        ) : null}
      </div>
      <input
        className="w-full min-w-0 max-w-full rounded border border-black/15 bg-white px-4 py-3 text-sm outline-none"
        placeholder={namePlaceholder}
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <input
        className="w-full min-w-0 max-w-full rounded border border-black/15 bg-white px-4 py-3 text-sm outline-none"
        placeholder={emailPlaceholder}
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <button className="shop-button w-full max-w-full rounded bg-black px-7 py-3 text-sm text-white" type="submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? submittingText : buttonText}
      </button>
      <p className="text-center text-xs leading-[1.4] text-black/45">{helperText}</p>
      {message ? (
        <p className={`text-sm leading-[1.4] ${status === 'error' ? 'text-red-700' : 'text-black/65'}`}>
          {message}
        </p>
      ) : null}
    </form>
  )
}
