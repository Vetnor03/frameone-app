'use client'

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'

type FrameOption = {
  id: 'american-walnut' | 'dark-charcoal' | 'light-oak'
  name: string
  swatch: string
}

type MatteOption = {
  id: 'beige' | 'solid-black' | 'new-castle' | 'sanguine' | 'midnight-blue-velour' | 'silver-birch'
  name: string
  swatch: string
  limited?: boolean
}

const frames: FrameOption[] = [
  { id: 'american-walnut', name: 'American Walnut', swatch: '#6f4a35' },
  { id: 'dark-charcoal', name: 'Dark Charcoal', swatch: '#30302d' },
  { id: 'light-oak', name: 'Light Oak', swatch: '#c6a277' },
]

const mattes: MatteOption[] = [
  { id: 'beige', name: 'Beige', swatch: '#d6c8b5' },
  { id: 'solid-black', name: 'Solid Black', swatch: '#242423' },
  { id: 'new-castle', name: 'New Castle', swatch: '#555553' },
  { id: 'sanguine', name: 'Sanguine', swatch: '#835154' },
  { id: 'midnight-blue-velour', name: 'Midnight Blue Velour', swatch: '#24364c', limited: true },
  { id: 'silver-birch', name: 'Silver Birch', swatch: '#b9b4aa', limited: true },
]

const inputClass =
  'h-11 w-full rounded-[10px] border border-black/15 bg-white px-3.5 text-[16px] text-[#1d1d1b] outline-none transition placeholder:text-black/35 focus:border-black/45 focus:ring-2 focus:ring-black/5'

function frameMaterial(frame: FrameOption): CSSProperties {
  const grain = 'repeating-linear-gradient(94deg, transparent 0 7px, rgba(255,255,255,.07) 7px 8px, transparent 8px 16px), repeating-linear-gradient(2deg, rgba(0,0,0,.06) 0 1px, transparent 1px 8px)'
  return {
    backgroundColor: frame.swatch,
    backgroundImage: grain,
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.22), inset 0 1px rgba(255,255,255,.14), 0 18px 38px rgba(29,27,23,.13)',
  }
}

function matteMaterial(matte: MatteOption): CSSProperties {
  if (matte.id === 'midnight-blue-velour') {
    return {
      backgroundColor: matte.swatch,
      backgroundImage: 'radial-gradient(circle at 25% 20%, rgba(255,255,255,.08) 0 1px, transparent 1.5px), radial-gradient(circle at 70% 65%, rgba(255,255,255,.05) 0 1px, transparent 1.5px)',
      backgroundSize: '7px 7px, 9px 9px',
    }
  }

  if (matte.id === 'silver-birch') {
    return {
      backgroundColor: matte.swatch,
      backgroundImage: 'repeating-linear-gradient(92deg, rgba(255,255,255,.2) 0 1px, transparent 1px 5px), repeating-linear-gradient(2deg, rgba(70,65,58,.08) 0 1px, transparent 1px 9px)',
    }
  }

  return { backgroundColor: matte.swatch }
}

function ProductPreview({ frame, matte }: { frame: FrameOption; matte: MatteOption }) {
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-[340px] select-none sm:max-w-[560px] lg:max-w-[700px]" aria-label={`${frame.name} frame with ${matte.name} matte`}>
      <div className="absolute inset-[4.4%] rounded-[5px] p-[6.7%]" style={frameMaterial(frame)}>
        <div
          className="h-full w-full p-[10.8%] shadow-[inset_0_0_0_1px_rgba(0,0,0,.14),inset_0_0_18px_rgba(0,0,0,.06)]"
          style={matteMaterial(matte)}
        >
          <div className="relative flex h-full w-full overflow-hidden rounded-[2px] border border-black/20 shadow-[0_1px_5px_rgba(0,0,0,.18)]">
            <div className="flex w-1/2 items-center justify-end bg-[#e9e8e2] pr-[2%] text-[#222220]">
              <span className="text-[clamp(11px,2vw,23px)] font-semibold leading-none tracking-[0.18em]">RE:</span>
            </div>
            <div className="flex w-1/2 items-center justify-start bg-[#222220] pl-[2%] text-[#eceae3]">
              <span className="text-[clamp(11px,2vw,23px)] font-semibold leading-none tracking-[0.18em]">MIND</span>
            </div>
            <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(#000_0.55px,transparent_0.7px)] [background-size:3px_3px]" />
          </div>
        </div>
      </div>
    </div>
  )
}

function SelectionButton({
  selected,
  label,
  swatch,
  limited,
  onClick,
}: {
  selected: boolean
  label: string
  swatch: string
  limited?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-w-0 rounded-[10px] border p-1.5 text-left transition focus:outline-none focus:ring-2 focus:ring-black/20 sm:rounded-[12px] sm:p-2 ${
        selected ? 'border-black bg-white shadow-[0_1px_4px_rgba(0,0,0,.05)]' : 'border-black/10 bg-white/55 hover:border-black/25 hover:bg-white'
      }`}
    >
      <span className="mb-1.5 block h-4 w-full rounded-[5px] border border-black/10 sm:h-6" style={{ backgroundColor: swatch }} />
      <span className="flex min-w-0 items-start justify-between gap-1">
        <span className="min-w-0 text-[10px] font-medium leading-[1.15] text-[#1d1d1b] sm:text-[11px]">{label}</span>
        {selected ? <span className="shrink-0 text-[10px] font-semibold sm:text-[11px]">✓</span> : null}
      </span>
      {limited ? <span className="mt-0.5 block text-[8px] font-semibold uppercase tracking-[0.08em] text-black/45">Limited</span> : null}
    </button>
  )
}

type PilotInvitation = {
  fullName: string
  email: string
  frameId: FrameOption['id'] | null
  matteId: MatteOption['id'] | null
  orderStatus: string | null
}

export default function PilotConfigurator({ inviteId }: { inviteId: string }) {
  const [frameId, setFrameId] = useState<FrameOption['id']>('american-walnut')
  const [matteId, setMatteId] = useState<MatteOption['id']>('beige')
  const [step, setStep] = useState<1 | 2>(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [invitation, setInvitation] = useState<PilotInvitation | null>(null)
  const [inviteError, setInviteError] = useState('')
  const [loadingInvite, setLoadingInvite] = useState(true)
  const [savedAddress, setSavedAddress] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!inviteId) {
      setInviteError('Please use the personal link sent to you by RE:MIND.')
      setLoadingInvite(false)
      return
    }
    const controller = new AbortController()
    fetch('/api/pilot/orders?invite=' + encodeURIComponent(inviteId), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok || !data || typeof data.email !== 'string') {
          throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to verify your invitation.')
        }
        return data as PilotInvitation
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setInvitation(data)
        if (frames.some((item) => item.id === data.frameId)) setFrameId(data.frameId as FrameOption['id'])
        if (mattes.some((item) => item.id === data.matteId)) setMatteId(data.matteId as MatteOption['id'])
        setSubmitted(Boolean(data.orderStatus))
        setSubmittedEmail(data.email)
        setLoadingInvite(false)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setInviteError(reason instanceof Error ? reason.message : 'Unable to verify your invitation.')
        setLoadingInvite(false)
      })
    return () => controller.abort()
  }, [inviteId])

  const isLocked = Boolean(invitation?.orderStatus && invitation.orderStatus !== 'submitted')

  const frame = useMemo(() => frames.find((item) => item.id === frameId) ?? frames[0], [frameId])
  const matte = useMemo(() => mattes.find((item) => item.id === matteId) ?? mattes[0], [matteId])

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!invitation || isLocked || submitting) return
    setSubmitting(true)
    setError('')

    const form = new FormData(event.currentTarget)
    const payload = {
      invite: inviteId,
      addressLine1: String(form.get('addressLine1') || ''),
      addressLine2: String(form.get('addressLine2') || ''),
      postalCode: String(form.get('postalCode') || ''),
      city: String(form.get('city') || ''),
      country: String(form.get('country') || ''),
      website: String(form.get('website') || ''),
      frameId,
      matteId,
    }

    try {
      const response = await fetch('/api/pilot/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'Could not save your pilot order.')
      }

      setSavedAddress({
        addressLine1: payload.addressLine1,
        addressLine2: payload.addressLine2,
        postalCode: payload.postalCode,
        city: payload.city,
        country: payload.country,
      })
      setSubmittedEmail(invitation.email)
      setSubmitted(true)
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Could not save your pilot order.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingInvite || !invitation) {
    return (
      <main className="pilot-page min-h-screen bg-[#f3f1ec] px-5 text-[#1d1d1b]">
        <header className="mx-auto flex h-16 max-w-[1080px] items-center border-b border-black/10 text-[17px] font-semibold tracking-[.16em]">RE:MIND</header>
        <section className="mx-auto flex min-h-[65vh] max-w-[520px] flex-col justify-center">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-black/45">Your pilot frame</p>
          <h1 className="mt-3 text-[clamp(30px,5vw,44px)] font-medium tracking-[-.045em]">{loadingInvite ? 'Checking your invitation…' : 'Invitation unavailable'}</h1>
          {!loadingInvite ? <p role="alert" className="mt-3 text-[14px] leading-6 text-black/60">{inviteError}</p> : null}
          {!loadingInvite ? <p className="mt-4 text-[13px] text-black/50">If you were selected for the pilot, please open the personal link in your invitation email.</p> : null}
        </section>
      </main>
    )
  }

  return (
    <main className="pilot-page min-h-screen overflow-x-hidden bg-[#f3f1ec] text-[#1d1d1b]">
      <header className="flex h-12 items-center justify-between border-b border-black/10 px-4 sm:h-14 sm:px-8 lg:px-10">
        <span className="text-[16px] font-semibold tracking-[0.16em] sm:text-[17px]">RE:MIND</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-black/45 sm:text-[11px]">Pilot selection</span>
      </header>

      <div className="mx-auto flex w-full max-w-[1280px] flex-1 items-start px-3 py-2 sm:px-6 sm:py-4 lg:min-h-[calc(100vh-56px)] lg:items-center lg:px-8 lg:py-4 xl:px-10">
        <div className="grid w-full items-center gap-3 lg:grid-cols-[minmax(0,1.08fr)_minmax(390px,.92fr)] lg:gap-6 xl:gap-8">
          <section className={`min-w-0 ${step === 2 || submitted ? 'hidden lg:block' : ''}`}>
            <div className="mb-1.5 flex items-end justify-between gap-3 px-1 sm:mb-3 lg:mb-4">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/40 sm:text-[10px]">Your configuration</p>
                <h1 className="mt-0.5 truncate text-[17px] font-medium tracking-[-0.025em] sm:mt-1 sm:text-[23px] lg:text-[25px]">{frame.name} · {matte.name}</h1>
              </div>
              <span className="hidden shrink-0 rounded-full border border-black/10 bg-white/55 px-3 py-1.5 text-[10px] font-medium text-black/50 sm:block">Light + dark included</span>
            </div>

            <div className="rounded-[16px] border border-black/8 bg-[#e8e5de] p-2 sm:rounded-[20px] sm:p-3 lg:p-5">
              <ProductPreview frame={frame} matte={matte} />
            </div>
            <p className="mt-1 px-1 text-center text-[9px] leading-3 text-black/35 sm:mt-1.5 sm:text-[10px] sm:leading-4">Illustrative preview · colours and material textures may differ slightly in person.</p>
          </section>

          <section className="min-w-0 rounded-[16px] border border-black/10 bg-[#faf9f6] p-3 sm:rounded-[20px] sm:p-4 lg:p-5">
            {!submitted && step === 1 ? (
              <>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/40 sm:text-[10px]">Step 1 of 2</p>
                  <h2 className="mt-0.5 text-[20px] font-medium tracking-[-0.03em] sm:mt-1 sm:text-[23px]">Make it yours</h2>
                  <p className="mt-0.5 text-[11px] leading-4 text-black/50 sm:mt-1 sm:text-[12px]">Choose one frame and one passepartout for your loan unit. Light and dark screen modes are both included.</p>
                </div>

                <div className="mt-3 sm:mt-4">
                  <div className="mb-1.5 flex items-center justify-between sm:mb-2">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/55 sm:text-[11px]">Frame</h3>
                    <span className="text-[10px] text-black/40 sm:text-[11px]">{frame.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                    {frames.map((option) => (
                      <SelectionButton
                        key={option.id}
                        selected={frameId === option.id}
                        label={option.name}
                        swatch={option.swatch}
                        onClick={() => setFrameId(option.id)}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-3 sm:mt-4">
                  <div className="mb-1.5 flex items-center justify-between sm:mb-2">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/55 sm:text-[11px]">Matte</h3>
                    <span className="max-w-[60%] truncate text-[10px] text-black/40 sm:text-[11px]">{matte.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                    {mattes.map((option) => (
                      <SelectionButton
                        key={option.id}
                        selected={matteId === option.id}
                        label={option.name}
                        swatch={option.swatch}
                        limited={option.limited}
                        onClick={() => setMatteId(option.id)}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/10 pt-3 sm:mt-4 sm:gap-3 sm:pt-4">
                  <p className="min-w-0 truncate text-[10px] text-black/50 sm:text-[12px]"><span className="font-medium text-black/75">Selected:</span> {frame.name} + {matte.name}</p>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="h-10 shrink-0 rounded-[10px] bg-[#1d1d1b] px-4 text-[11px] font-semibold text-white transition hover:bg-black focus:outline-none focus:ring-2 focus:ring-black/30 focus:ring-offset-2 sm:h-11 sm:rounded-[11px] sm:px-5 sm:text-[12px]"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : null}

            {!submitted && step === 2 ? (
              <form onSubmit={submitOrder}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">Step 2 of 2</p>
                    <h2 className="mt-1 text-[24px] font-medium tracking-[-0.03em]">Delivery details</h2>
                    <p className="mt-1.5 text-[13px] leading-5 text-black/50">Please confirm your details and enter the delivery address for your pilot frame.</p>
                  </div>
                  <button type="button" onClick={() => setStep(1)} className="shrink-0 text-[12px] font-medium text-black/45 underline decoration-black/20 underline-offset-4 hover:text-black/70">Back</button>
                </div>

                <div className="mt-5 grid gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-medium text-black/60">Full name</span>
                    <input className={inputClass} name="fullName" autoComplete="name" readOnly value={invitation.fullName} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-medium text-black/60">Email</span>
                    <input className={inputClass} name="email" type="email" autoComplete="email" readOnly value={invitation.email} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-medium text-black/60">Address</span>
                    <input className={inputClass} name="addressLine1" autoComplete="address-line1" required maxLength={160} defaultValue={savedAddress.addressLine1 || ''} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-medium text-black/60">Apartment, floor, etc. <span className="font-normal text-black/35">(optional)</span></span>
                    <input className={inputClass} name="addressLine2" autoComplete="address-line2" maxLength={160} defaultValue={savedAddress.addressLine2 || ''} />
                  </label>
                  <div className="grid grid-cols-[minmax(105px,.72fr)_minmax(0,1.28fr)] gap-3">
                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-medium text-black/60">Postal code</span>
                      <input className={inputClass} name="postalCode" autoComplete="postal-code" required maxLength={16} defaultValue={savedAddress.postalCode || ''} />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-medium text-black/60">City</span>
                      <input className={inputClass} name="city" autoComplete="address-level2" required maxLength={100} defaultValue={savedAddress.city || ''} />
                    </label>
                  </div>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-medium text-black/60">Country</span>
                    <input className={inputClass} name="country" autoComplete="country-name" required defaultValue={savedAddress.country || 'Norway'} maxLength={80} />
                  </label>
                  <label className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                    Website
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>

                {error ? <p role="alert" className="mt-3 rounded-[9px] bg-red-950/5 px-3 py-2 text-[12px] text-red-950/75">{error}</p> : null}

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-black/10 pt-4">
                  <p className="min-w-0 text-[11px] leading-4 text-black/45">{frame.name}<br />{matte.name}</p>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-11 shrink-0 rounded-[11px] bg-[#1d1d1b] px-5 text-[12px] font-semibold text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-black/30 focus:ring-offset-2"
                  >
                    {submitting ? 'Saving…' : 'Confirm my selection'}
                  </button>
                </div>
              </form>
            ) : null}

            {submitted ? (
              <div className="flex min-h-[430px] flex-col justify-center py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1d1d1b] text-[18px] font-semibold text-white">✓</div>
                <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">Selection saved</p>
                <h2 className="mt-1 text-[28px] font-medium tracking-[-0.035em]">Your frame is selected.</h2>
                <p className="mt-3 max-w-[32rem] text-[14px] leading-6 text-black/55">We saved your choice of frame and passepartout for your three-week pilot loan. Your RE:MIND prototype will be returned after the test. We will contact you with the next steps.</p>

                <dl className="mt-6 divide-y divide-black/10 border-y border-black/10 text-[13px]">
                  <div className="flex justify-between gap-5 py-3"><dt className="text-black/40">Frame</dt><dd className="text-right font-medium">{frame.name}</dd></div>
                  <div className="flex justify-between gap-5 py-3"><dt className="text-black/40">Matte</dt><dd className="text-right font-medium">{matte.name}</dd></div>
                  <div className="flex justify-between gap-5 py-3"><dt className="text-black/40">Email</dt><dd className="min-w-0 truncate text-right font-medium">{submittedEmail}</dd></div>
                </dl>

                {!isLocked ? (
                  <button
                    type="button"
                    onClick={() => { setSubmitted(false); setStep(1); setError('') }}
                    className="mt-5 self-start text-[12px] font-medium text-black/45 underline decoration-black/20 underline-offset-4 hover:text-black/70"
                  >
                    Change my selection
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  )
}
