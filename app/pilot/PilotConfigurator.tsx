'use client'

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import Image from 'next/image'
import { pilotCombinationPhoto } from '@/app/lib/pilotCombinationPhotos'
import { defaultPilotPhotoAlignment, getPilotPhotoAlignment, type PilotPhotoAlignment } from '@/app/lib/pilotPhotoAlignment'
import { pilotFrameNames, pilotMatteNames, type PilotFrameId, type PilotMatteId } from '@/app/lib/pilotSelection'

type FrameOption = {
  id: PilotFrameId
  name: string
  swatch: string
}

type MatteOption = {
  id: PilotMatteId
  name: string
  swatch: string
}

const frames: FrameOption[] = [
  { id: 'american-walnut', name: pilotFrameNames['american-walnut'], swatch: '#6f4a35' },
  { id: 'dark-charcoal', name: pilotFrameNames['dark-charcoal'], swatch: '#30302d' },
  { id: 'light-oak', name: pilotFrameNames['light-oak'], swatch: '#c6a277' },
]

const mattes: MatteOption[] = [
  { id: 'beige', name: pilotMatteNames.beige, swatch: '#d6c8b5' },
  { id: 'new-castle', name: pilotMatteNames['new-castle'], swatch: '#555553' },
  { id: 'sanguine', name: pilotMatteNames.sanguine, swatch: '#835154' },
  { id: 'green', name: pilotMatteNames.green, swatch: '#344b3d' },
  { id: 'solid-black', name: pilotMatteNames['solid-black'], swatch: '#242423' },
]

// Keep previously submitted choices readable, while showing five new options.
const legacyMattes: MatteOption[] = [
  { id: 'midnight-blue-velour', name: pilotMatteNames['midnight-blue-velour'], swatch: '#24364c' },
  { id: 'silver-birch', name: pilotMatteNames['silver-birch'], swatch: '#b9b4aa' },
]

// Material imagery is generated for the pilot selector; the colours are illustrative,
 // not colour-calibrated photographs of the HFS Rammer product samples.
function materialTexture(id: string) {
  return `url("/pilot-materials/${id}-sharp.webp")`
}

function frameMaterial(frame: FrameOption): CSSProperties {
  return {
    backgroundColor: frame.swatch,
    backgroundImage: materialTexture(frame.id),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.22), inset 0 1px rgba(255,255,255,.14), 0 18px 38px rgba(29,27,23,.13)',
  }
}

function matteMaterial(matte: MatteOption): CSSProperties {
  return {
    backgroundColor: matte.swatch,
    backgroundImage: materialTexture(matte.id),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
}

// Fallback for missing image files and older, discontinued matte choices.
function IllustratedProductPreview({ frame, matte }: { frame: FrameOption; matte: MatteOption }) {
  return (
    <div className="absolute inset-[4.4%] rounded-[5px] p-[6.7%]" style={frameMaterial(frame)}>
      <div className="h-full w-full p-[10.8%] shadow-[inset_0_0_0_1px_rgba(0,0,0,.14),inset_0_0_18px_rgba(0,0,0,.06)]" style={matteMaterial(matte)}>
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
  )
}

// Each image is a 1448×1086 JPG with a white background, but its outer-frame
// margins vary. Sample a small canvas once on load to align the photographed
// frame itself, not the full JPG. Source pixels are never edited or cropped.
function measurePilotPhoto(image: HTMLImageElement): PilotPhotoAlignment {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 192
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return defaultPilotPhotoAlignment
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    return getPilotPhotoAlignment(data, canvas.width, canvas.height)
  } catch {
    // A failed canvas read must never prevent the real photo from displaying.
    return defaultPilotPhotoAlignment
  }
}

function ProductPreview({ frame, matte }: { frame: FrameOption; matte: MatteOption }) {
  const photoSrc = pilotCombinationPhoto(frame.id, matte.id)
  const [readyPhoto, setReadyPhoto] = useState<{ src: string; alignment: PilotPhotoAlignment } | null>(null)
  const [failedPhotoSrc, setFailedPhotoSrc] = useState<string | null>(null)
  const photoReady = Boolean(photoSrc && readyPhoto?.src === photoSrc && failedPhotoSrc !== photoSrc)
  const alignment = photoReady ? readyPhoto!.alignment : defaultPilotPhotoAlignment

  return (
    <div
      className="relative mx-auto aspect-[4/3] w-full max-w-[340px] overflow-hidden bg-white select-none sm:max-w-[560px] lg:max-w-[700px]"
      aria-label={`${frame.name} frame with ${matte.name} matte`}
    >
      {/* Historical mattes have no photographs. Never flash this mock while a real JPG loads. */}
      {!photoSrc ? <IllustratedProductPreview frame={frame} matte={matte} /> : null}
      {photoSrc && photoSrc !== failedPhotoSrc ? (
        <Image
          key={photoSrc}
          src={photoSrc}
          alt={`${frame.name} frame with ${matte.name} passepartout`}
          fill
          unoptimized
          loading="eager"
          sizes="(min-width: 1024px) 700px, (min-width: 640px) 560px, 340px"
          className={`object-contain transition-opacity duration-200 ${photoReady ? 'opacity-100' : 'opacity-0'}`}
          style={{
            transformOrigin: 'center',
            transform: `translate(${alignment.offsetX}%, ${alignment.offsetY}%) scale(${alignment.scale})`,
            // Subtle browser-only colour lift. Keep neutrals and the screen white
            // natural, while giving the red and green passepartouts extra depth.
            // The original JPGs and geometry remain completely unchanged.
            filter: matte.id === 'green' || matte.id === 'sanguine'
              ? 'saturate(1.18) contrast(1.04)'
              : 'saturate(1.07) contrast(1.04)',
          }}
          onLoad={(event) => setReadyPhoto({ src: photoSrc, alignment: measurePilotPhoto(event.currentTarget) })}
          onError={() => setFailedPhotoSrc(photoSrc)}
        />
      ) : null}
      {photoSrc && failedPhotoSrc === photoSrc ? (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[12px] text-black/45" role="status">
          Photograph temporarily unavailable
        </div>
      ) : null}
    </div>
  )
}

function SelectionButton({
  selected,
  label,
  swatch,
  onClick,
}: {
  selected: boolean
  label: string
  swatch: string
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
      <span
        className="mb-1.5 block h-9 w-full rounded-[5px] border border-black/10 sm:h-12"
        style={{ backgroundColor: swatch }}
        aria-hidden="true"
      />
      <span className="flex min-w-0 items-start justify-between gap-1">
        <span className="min-w-0 text-[10px] font-medium leading-[1.15] text-[#1d1d1b] sm:text-[11px]">{label}</span>
        {selected ? <span className="shrink-0 text-[10px] font-semibold sm:text-[11px]">✓</span> : null}
      </span>
    </button>
  )
}

type PilotInvitation = {
  fullName: string
  email: string
  frameId: PilotFrameId | null
  matteId: PilotMatteId | null
  orderStatus: string | null
}

export default function PilotConfigurator({ inviteId, demoMode = false }: { inviteId: string; demoMode?: boolean }) {
  const [frameId, setFrameId] = useState<PilotFrameId>('american-walnut')
  const [matteId, setMatteId] = useState<PilotMatteId>('beige')
  const [step, setStep] = useState<1 | 2>(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [invitation, setInvitation] = useState<PilotInvitation | null>(null)
  const [inviteError, setInviteError] = useState('')
  const [loadingInvite, setLoadingInvite] = useState(true)

  useEffect(() => {
    if (demoMode) {
      setInvitation({ fullName: 'Preview', email: 'preview@example.invalid', frameId: null, matteId: null, orderStatus: null })
      setLoadingInvite(false)
      return
    }
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
        if (frames.some((item) => item.id === data.frameId)) setFrameId(data.frameId as PilotFrameId)
        if ([...mattes, ...legacyMattes].some((item) => item.id === data.matteId)) setMatteId(data.matteId as PilotMatteId)
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
  }, [inviteId, demoMode])

  const isLocked = Boolean(invitation?.orderStatus && invitation.orderStatus !== 'submitted')

  const frame = useMemo(() => frames.find((item) => item.id === frameId) ?? frames[0], [frameId])
  const matte = useMemo(() => [...mattes, ...legacyMattes].find((item) => item.id === matteId) ?? mattes[0], [matteId])

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!invitation || isLocked || submitting) return
    setError('')

    // The founder's demo exercises every screen without contacting the API.
    // Production submissions always go through the invitation-validated POST below.
    if (demoMode) {
      setSubmittedEmail(invitation.email)
      setSubmitted(true)
      return
    }

    setSubmitting(true)
    const payload = { invite: inviteId, frameId, matteId }

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
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-black/45 sm:text-[11px]">{demoMode ? 'Preview only' : 'Pilot selection'}</span>
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
            <p className="mt-1 px-1 text-center text-[9px] leading-3 text-black/35 sm:mt-1.5 sm:text-[10px] sm:leading-4">Preview of your selected frame and passepartout · screen content is illustrative.</p>
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
                        onClick={() => setMatteId(option.id)}
                      />
                    ))}
                  </div>
                </div>

                {demoMode ? <p className="mt-3 text-[11px] leading-4 text-black/50">Demo mode · Try the full selection flow. No pilot order will be saved.</p> : null}
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/10 pt-3 sm:mt-4 sm:gap-3 sm:pt-4">
                  <p className="min-w-0 truncate text-[10px] text-black/50 sm:text-[12px]"><span className="font-medium text-black/75">Selected:</span> {frame.name} + {matte.name}</p>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="h-10 shrink-0 rounded-[10px] bg-[#1d1d1b] px-4 text-[11px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-45 focus:outline-none focus:ring-2 focus:ring-black/30 focus:ring-offset-2 sm:h-11 sm:rounded-[11px] sm:px-5 sm:text-[12px]"
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
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">Steg 2 av 2</p>
                    <h2 className="mt-1 text-[24px] font-medium tracking-[-0.03em]">Bekreft rammevalget</h2>
                    <p className="mt-1.5 text-[13px] leading-5 text-black/50">Leveringsinformasjonen er allerede registrert. Nå velger du bare uttrykket for din låneramme.</p>
                  </div>
                  <button type="button" onClick={() => setStep(1)} className="shrink-0 text-[12px] font-medium text-black/45 underline decoration-black/20 underline-offset-4 hover:text-black/70">Tilbake</button>
                </div>
                <dl className="mt-6 divide-y divide-black/10 border-y border-black/10 text-[13px]">
                  <div className="flex items-start justify-between gap-4 py-3"><dt className="text-black/50">Ramme</dt><dd className="text-right font-medium">{frame.name}</dd></div>
                  <div className="flex items-start justify-between gap-4 py-3"><dt className="text-black/50">Passepartout</dt><dd className="text-right font-medium">{matte.name}</dd></div>
                  <div className="flex items-start justify-between gap-4 py-3"><dt className="text-black/50">E-post</dt><dd className="min-w-0 truncate text-right font-medium">{invitation.email}</dd></div>
                </dl>
                <p className="mt-5 text-[12px] leading-5 text-black/50">Dette er et kostnadsfritt lån i pilottesten, ikke et kjøp. Enheten og rammen skal returneres ved forespørsel eller når testen avsluttes.</p>
                {demoMode ? <p className="mt-3 rounded-[9px] border border-black/10 bg-white/60 px-3 py-2 text-[12px] leading-5 text-black/65">Testmodus: Du kan bekrefte for å se siste steg, men ingenting lagres.</p> : null}
                {error ? <p role="alert" className="mt-3 rounded-[9px] bg-red-950/5 px-3 py-2 text-[12px] text-red-950/75">{error}</p> : null}
                <div className="mt-5 flex justify-end border-t border-black/10 pt-4">
                  <button type="submit" disabled={submitting} className="h-11 shrink-0 rounded-[11px] bg-[#1d1d1b] px-5 text-[12px] font-semibold text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-black/30 focus:ring-offset-2">
                    {demoMode ? 'Test bekreftelse' : submitting ? 'Lagrer…' : 'Bekreft rammevalget'}
                  </button>
                </div>
              </form>
            ) : null}

            {submitted ? (
              <div className="flex min-h-[430px] flex-col justify-center py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1d1d1b] text-[18px] font-semibold text-white">✓</div>
                <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">{demoMode ? 'Demo complete · Nothing saved' : 'Selection saved'}</p>
                <h2 className="mt-1 text-[28px] font-medium tracking-[-0.035em]">{demoMode ? 'This is the confirmation screen.' : 'Your frame is selected.'}</h2>
                <p className="mt-3 max-w-[32rem] text-[14px] leading-6 text-black/55">{demoMode ? 'This is a preview of the final step. No pilot order has been created or changed. You can try another combination below.' : 'We saved your choice of frame and passepartout for your three-week pilot loan. Your RE:MIND prototype will be returned after the test. We will contact you with the next steps.'}</p>

                <dl className="mt-6 divide-y divide-black/10 border-y border-black/10 text-[13px]">
                  <div className="flex justify-between gap-5 py-3"><dt className="text-black/40">Frame</dt><dd className="text-right font-medium">{frame.name}</dd></div>
                  <div className="flex justify-between gap-5 py-3"><dt className="text-black/40">Matte</dt><dd className="text-right font-medium">{matte.name}</dd></div>
                  <div className="flex justify-between gap-5 py-3"><dt className="text-black/40">Email</dt><dd className="min-w-0 truncate text-right font-medium">{submittedEmail}</dd></div>
                </dl>

                {!isLocked ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!mattes.some((option) => option.id === matteId)) setMatteId('beige')
                      setSubmitted(false)
                      setStep(1)
                      setError('')
                    }}
                    className="mt-5 self-start text-[12px] font-medium text-black/45 underline decoration-black/20 underline-offset-4 hover:text-black/70"
                  >
                    {demoMode ? 'Try another combination' : 'Change my selection'}
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
