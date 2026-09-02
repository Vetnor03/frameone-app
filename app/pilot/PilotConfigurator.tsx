'use client'

import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'

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
    <div className="relative mx-auto aspect-[4/3] w-full max-w-[700px] select-none" aria-label={`${frame.name} frame with ${matte.name} matte`}>
      <div className="absolute inset-[4.4%] rounded-[5px] p-[6.7%]" style={frameMaterial(frame)}>
        <div
          className="h-full w-full p-[10.8%] shadow-[inset_0_0_0_1px_rgba(0,0,0,.14),inset_0_0_18px_rgba(0,0,0,.06)]"
          style={matteMaterial(matte)}
        >
          <div className="relative flex h-full w-full overflow-hidden rounded-[2px] border border-black/20 shadow-[0_1px_5px_rgba(0,0,0,.18)]">
            <div className="flex w-1/2 items-center justify-end bg-[#e9e8e2] pr-[2%] text-[#222220]">
              <span className="translate-x-1/2 text-[clamp(12px,2.1vw,23px)] font-semibold tracking-[0.18em]">RE:</span>
            </div>
            <div className="flex w-1/2 items-center justify-start bg-[#222220] pl-[2%] text-[#eceae3]">
              <span className="-translate-x-1/2 text-[clamp(12px,2.1vw,23px)] font-semibold tracking-[0.18em]">MIND</span>
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
      className={`min-w-0 rounded-[12px] border p-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-black/20 ${
        selected ? 'border-black bg-white shadow-[0_1px_4px_rgba(0,0,0,.05)]' : 'border-black/10 bg-white/55 hover:border-black/25 hover:bg-white'
      }`}
    >
      <span className="mb-2 block h-7 w-full rounded-[6px] border border-black/10" style={{ backgroundColor: swatch }} />
      <span className="flex min-w-0 items-start justify-between gap-1.5">
        <span className="min-w-0 text-[12px] font-medium leading-[1.2] text-[#1d1d1b]">{label}</span>
        {selected ? <span className="shrink-0 text-[12px] font-semibold">✓</span> : null}
      </span>
      {limited ? <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.09em] text-black/45">Limited</span> : null}
    </button>
  )
}

export default function PilotConfigurator() {
  const [frameId, setFrameId] = useState<FrameOption['id']>('american-walnut')
  const [matteId, setMatteId] = useState<MatteOption['id']>('beige')
  const [step, setStep] = useState<1 | 2>(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [submittedEmail, setSubmittedEmail] = useState('')

  const frame = useMemo(() => frames.find((item) => item.id === frameId) ?? frames[0], [frameId])
  const matte = useMemo(() => mattes.find((item) => item.id === matteId) ?? mattes[0], [matteId])

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    const form = new FormData(event.currentTarget)
    const payload = {
      fullName: String(form.get('fullName') || ''),
      email: String(form.get('email') || ''),
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

      setSubmittedEmail(payload.email.trim())
      setSubmitted(true)
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Could not save your pilot order.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f1ec] text-[#1d1d1b]">
      <header className="flex h-16 items-center justify-between border-b border-black/10 px-5 sm:px-8 lg:px-10">
        <a href="/" className="text-[17px] font-semibold tracking-[0.16em]">RE:MIND</a>
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-black/45">Pilot order</span>
      </header>

      <div className="mx-auto flex w-full max-w-[1280px] flex-1 items-center px-4 py-5 sm:px-7 lg:min-h-[calc(100vh-64px)] lg:px-10 lg:py-6">
        <div className="grid w-full items-center gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(390px,.92fr)] lg:gap-10 xl:gap-14">
          <section className="min-w-0">
            <div className="mb-3 flex items-end justify-between gap-4 px-1 lg:mb-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">Your configuration</p>
                <h1 className="mt-1 text-[22px] font-medium tracking-[-0.025em] sm:text-[26px]">{frame.name} · {matte.name}</h1>
              </div>
              <span className="hidden shrink-0 rounded-full border border-black/10 bg-white/55 px-3 py-1.5 text-[10px] font-medium text-black/50 sm:block">Light + dark included</span>
            </div>

            <div className="rounded-[20px] border border-black/8 bg-[#e8e5de] p-3 sm:p-5 lg:p-7">
              <ProductPreview frame={frame} matte={matte} />
            </div>
            <p className="mt-2 px-1 text-center text-[10px] leading-4 text-black/35">Preview placeholder · final product photos will replace this visual.</p>
          </section>

          <section className="min-w-0 rounded-[20px] border border-black/10 bg-[#faf9f6] p-4 sm:p-6 lg:p-7">
            {!submitted && step === 1 ? (
              <>
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">Step 1 of 2</p>
                    <h2 className="mt-1 text-[24px] font-medium tracking-[-0.03em]">Choose your finish</h2>
                    <p className="mt-1.5 text-[13px] leading-5 text-black/50">The display is always shown half light and half dark. Screen mode is not an order choice.</p>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2.5 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/55">Frame</h3>
                    <span className="text-[11px] text-black/40">{frame.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
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

                <div className="mt-5">
                  <div className="mb-2.5 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/55">Matte</h3>
                    <span className="text-[11px] text-black/40">{matte.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
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

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-black/10 pt-4">
                  <p className="min-w-0 text-[12px] text-black/50"><span className="font-medium text-black/75">Selected:</span> {frame.name} + {matte.name}</p>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="h-11 shrink-0 rounded-[11px] bg-[#1d1d1b] px-5 text-[12px] font-semibold text-white transition hover:bg-black focus:outline-none focus:ring-2 focus:ring-black/30 focus:ring-offset-2"
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
                    <h2 className="mt-1 text-[24px] font-medium tracking-[-0.03em]">Where should we send it?</h2>
                    <p className="mt-1.5 text-[13px] leading-5 text-black/50">Enter the email and shipping address for your pilot frame.</p>
                  </div>
                  <button type="button" onClick={() => setStep(1)} className="shrink-0 text-[12px] font-medium text-black/45 underline decoration-black/20 underline-offset-4 hover:text-black/70">Back</button>
                </div>

                <div className="mt-5 grid gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-medium text-black/60">Full name</span>
                    <input className={inputClass} name="fullName" autoComplete="name" required maxLength={120} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-medium text-black/60">Email</span>
                    <input className={inputClass} name="email" type="email" autoComplete="email" required maxLength={200} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-medium text-black/60">Address</span>
                    <input className={inputClass} name="addressLine1" autoComplete="address-line1" required maxLength={160} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-medium text-black/60">Apartment, floor, etc. <span className="font-normal text-black/35">(optional)</span></span>
                    <input className={inputClass} name="addressLine2" autoComplete="address-line2" maxLength={160} />
                  </label>
                  <div className="grid grid-cols-[minmax(105px,.72fr)_minmax(0,1.28fr)] gap-3">
                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-medium text-black/60">Postal code</span>
                      <input className={inputClass} name="postalCode" autoComplete="postal-code" required maxLength={16} />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-medium text-black/60">City</span>
                      <input className={inputClass} name="city" autoComplete="address-level2" required maxLength={100} />
                    </label>
                  </div>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-medium text-black/60">Country</span>
                    <input className={inputClass} name="country" autoComplete="country-name" required defaultValue="Norway" maxLength={80} />
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
                    {submitting ? 'Saving…' : 'Place pilot order'}
                  </button>
                </div>
              </form>
            ) : null}

            {submitted ? (
              <div className="flex min-h-[430px] flex-col justify-center py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1d1d1b] text-[18px] font-semibold text-white">✓</div>
                <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">Order received</p>
                <h2 className="mt-1 text-[28px] font-medium tracking-[-0.035em]">Your RE:MIND is reserved.</h2>
                <p className="mt-3 max-w-[32rem] text-[14px] leading-6 text-black/55">We saved your pilot selection and delivery details. No further action is needed right now.</p>

                <dl className="mt-6 divide-y divide-black/10 border-y border-black/10 text-[13px]">
                  <div className="flex justify-between gap-5 py-3"><dt className="text-black/40">Frame</dt><dd className="text-right font-medium">{frame.name}</dd></div>
                  <div className="flex justify-between gap-5 py-3"><dt className="text-black/40">Matte</dt><dd className="text-right font-medium">{matte.name}</dd></div>
                  <div className="flex justify-between gap-5 py-3"><dt className="text-black/40">Email</dt><dd className="min-w-0 truncate text-right font-medium">{submittedEmail}</dd></div>
                </dl>

                <button
                  type="button"
                  onClick={() => { setSubmitted(false); setStep(1); setError('') }}
                  className="mt-5 self-start text-[12px] font-medium text-black/45 underline decoration-black/20 underline-offset-4 hover:text-black/70"
                >
                  Change my selection
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  )
}
