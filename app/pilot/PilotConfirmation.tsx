'use client'

import Image from 'next/image'
import { useEffect, useState, type FormEvent } from 'react'

type Invitation = { fullName: string; email: string; confirmed: boolean }
type ViewState = 'loading' | 'form' | 'done' | 'invalid'

const inputClass = 'h-12 w-full rounded-xl border border-[#dcdad4] bg-white px-4 text-[16px] text-[#252621] outline-none transition placeholder:text-[#a3a39d] focus:border-[#4c5045] focus:ring-2 focus:ring-[#4c5045]/10'
const labelClass = 'grid gap-1.5 text-[12px] font-medium text-[#4c5049]'

function Field({ name, label, required = true, ...props }: {
  name: string; label: string; required?: boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'required'>) {
  return (
    <label className={labelClass}>
      <span>{label}{!required ? <span className="ml-1 font-normal text-black/35">(valgfritt)</span> : null}</span>
      <input name={name} required={required} className={inputClass} {...props} />
    </label>
  )
}

export default function PilotConfirmation({ inviteId, demoMode = false }: { inviteId: string; demoMode?: boolean }) {
  const [view, setView] = useState<ViewState>('loading')
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [invalidReason, setInvalidReason] = useState('')

  useEffect(() => {
    if (demoMode) {
      setInvitation({ fullName: 'Ola Nordmann', email: 'ola@eksempel.no', confirmed: false })
      setView('form')
      return
    }
    if (!inviteId) {
      setInvalidReason('Åpne den personlige lenken du har fått på e-post.')
      setView('invalid')
      return
    }
    const controller = new AbortController()
    fetch('/api/pilot/confirm?invite=' + encodeURIComponent(inviteId), {
      cache: 'no-store', signal: controller.signal,
    })
      .then(async (response) => {
        const data: unknown = await response.json().catch(() => null)
        if (!response.ok || !data || typeof data !== 'object' || !('fullName' in data) || !('email' in data)) {
          const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error : 'Invitasjonen kunne ikke bekreftes.'
          throw new Error(message)
        }
        return data as Invitation
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setInvitation(data)
        setView(data.confirmed ? 'done' : 'form')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setInvalidReason(reason instanceof Error ? reason.message : 'Kunne ikke åpne invitasjonen.')
        setView('invalid')
      })
    return () => controller.abort()
  }, [inviteId, demoMode])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending || demoMode || !invitation) return
    const form = new FormData(event.currentTarget)
    setSending(true)
    setError('')
    try {
      const response = await fetch('/api/pilot/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite: inviteId,
          fullName: String(form.get('fullName') || ''),
          phone: String(form.get('phone') || ''),
          addressLine1: String(form.get('addressLine1') || ''),
          addressLine2: String(form.get('addressLine2') || ''),
          postalCode: String(form.get('postalCode') || ''),
          city: String(form.get('city') || ''),
          loanAcknowledged: form.get('loanAcknowledged') === 'on',
          prototypeAcknowledged: form.get('prototypeAcknowledged') === 'on',
          feedbackAcknowledged: form.get('feedbackAcknowledged') === 'on',
          website: String(form.get('website') || ''),
        }),
      })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error : 'Kunne ikke lagre bekreftelsen.'
        throw new Error(message)
      }
      setView('done')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Noe gikk galt. Prøv igjen.')
    } finally {
      setSending(false)
    }
  }

  const confirmedName = invitation?.fullName.split(/\s+/)[0] || ''

  return (
    <main className="pilot-page min-h-screen bg-[#f3f1ec] text-[#292b26]">
      <header className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between border-b border-[#262923]/10 px-5 sm:px-8">
        <a href="https://re-mind.no" className="text-[19px] font-semibold tracking-[.16em]">RE:MIND</a>
        <span className="text-[10px] font-semibold uppercase tracking-[.19em] text-black/45">Pilotprogram · 2026</span>
      </header>

      <div className="mx-auto max-w-[1180px] px-5 pb-20 pt-10 sm:px-8 sm:pt-16">
        <nav aria-label="Steg i pilottesten" className="mb-10 flex items-center gap-3 text-[11px] font-medium tracking-[.04em] text-[#6d7067] sm:mb-14">
          <span className="flex items-center gap-2 text-[#292b26]"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#292b26] text-white">1</span> Bekreft deltakelse</span>
          <span aria-hidden="true" className="mx-1 h-px w-7 bg-black/20 sm:w-12" />
          <span className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full border border-black/15 bg-white/60">2</span> Velg ramme senere</span>
        </nav>

        <div className="grid items-start gap-11 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <section className="lg:sticky lg:top-12">
            <p className="text-[11px] font-semibold uppercase tracking-[.19em] text-[#7e806e]">Du er valgt ut</p>
            <h1 className="mt-4 max-w-[530px] text-[clamp(36px,4.2vw,58px)] font-medium leading-[1.06] tracking-[-.05em]">
              Velkommen til pilottesten.
            </h1>
            <p className="mt-6 max-w-[460px] text-[15px] leading-7 text-[#62655d]">
              Du er en av fem som får teste RE:MIND hjemme. Før vi sender ut låneenheten trenger vi noen leveringsopplysninger og en bekreftelse på lånevilkårene.
            </p>
            <div className="mt-8 overflow-hidden rounded-2xl border border-black/8 bg-[#eae7df]">
              <Image src="/shop/remind-device-v2.png" alt="RE:MIND e-ink-ramme" width={840} height={580} className="mx-auto h-auto w-full object-contain" />
            </div>
            <div className="mt-7 space-y-4 text-[13px] leading-6 text-[#60635c]">
              <p><strong className="text-[#30332c]">Omtrent tre ukers test.</strong> Du låner en utviklingsprototype og gir tilbakemeldinger fra hverdagen.</p>
              <p><strong className="text-[#30332c]">Din ramme, ditt uttrykk.</strong> Når du har bekreftet deltakelsen, får du en ny e-post med lenke hvor du kan sette sammen din egen låneramme og velge passepartout fra HFS Rammer.</p>
            </div>
          </section>

          <section className="rounded-[24px] border border-black/10 bg-[#fcfbf8] p-5 shadow-[0_20px_55px_rgba(40,38,33,.045)] sm:p-9">
            {view === 'loading' ? (
              <div role="status" className="flex min-h-[380px] items-center justify-center text-[14px] text-black/50">Kontrollerer invitasjonen …</div>
            ) : view === 'invalid' ? (
              <div className="flex min-h-[380px] flex-col justify-center">
                <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-black/45">Personlig invitasjon</p>
                <h2 className="mt-3 text-[31px] font-medium leading-tight tracking-[-.04em]">Lenken er ikke tilgjengelig.</h2>
                <p role="alert" className="mt-4 text-[14px] leading-6 text-black/60">{invalidReason}</p>
                <p className="mt-4 text-[13px] leading-6 text-black/50">Trenger du hjelp? Kontakt <a className="underline underline-offset-2" href="mailto:support@re-mind.no">support@re-mind.no</a>.</p>
              </div>
            ) : view === 'done' ? (
              <div className="flex min-h-[430px] flex-col justify-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[#343b2e] text-[25px] text-white" aria-hidden="true">✓</span>
                <p className="mt-7 text-[11px] font-semibold uppercase tracking-[.17em] text-[#68735e]">Bekreftelsen er registrert</p>
                <h2 className="mt-3 text-[34px] font-medium leading-tight tracking-[-.045em]">Takk{confirmedName ? `, ${confirmedName}` : ''}!</h2>
                <p className="mt-4 text-[15px] leading-7 text-black/65">Vi har mottatt bekreftelsen din og leveringsopplysningene. Du trenger ikke gjøre noe mer akkurat nå.</p>
                <div className="mt-8 rounded-xl border border-[#dfe2d8] bg-[#f0f2eb] p-5 text-[13px] leading-6 text-[#46503e]">
                  <p className="font-semibold">Neste steg: Design din egen ramme</p>
                  <p className="mt-1">Du vil motta en ny e-post fra RE:MIND med en personlig lenke for å velge ramme og passepartout fra HFS Rammer.</p>
                </div>
                <p className="mt-5 text-[12px] leading-5 text-black/45">Skal du endre leveringsadresse eller har du spørsmål? Skriv til <a className="underline" href="mailto:support@re-mind.no">support@re-mind.no</a>.</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="grid gap-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-black/40">Steg 1 · Bekreft deltakelsen</p>
                  <h2 className="mt-2 text-[30px] font-medium tracking-[-.04em]">Leveringsinformasjon</h2>
                  <p className="mt-2 text-[13px] leading-6 text-black/55">Fyll inn adressen som låneenheten skal sendes til. Ingen betaling eller kjøpsforpliktelse.</p>
                </div>

                <Field label="Fullt navn" name="fullName" autoComplete="name" defaultValue={invitation?.fullName} maxLength={100} placeholder="Fornavn og etternavn" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="E-post" name="email" type="email" autoComplete="email" value={invitation?.email || ''} readOnly />
                  <Field label="Telefonnummer" name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={25} placeholder="123 45 678" />
                </div>
                <Field label="Adresse" name="addressLine1" autoComplete="address-line1" maxLength={160} placeholder="Gateadresse og husnummer" />
                <Field label="Leilighet, etasje eller c/o" name="addressLine2" autoComplete="address-line2" maxLength={160} required={false} placeholder="Tilleggsinformasjon" />
                <div className="grid grid-cols-[minmax(115px,.7fr)_minmax(0,1.3fr)] gap-4">
                  <Field label="Postnummer" name="postalCode" autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="0000" />
                  <Field label="Poststed" name="city" autoComplete="address-level2" maxLength={100} placeholder="Poststed" />
                </div>
                <Field label="Land" name="country" autoComplete="country-name" readOnly value="Norge" />

                <div className="mt-1 border-t border-black/10 pt-6">
                  <h3 className="text-[16px] font-semibold">Vilkår for pilottesten</h3>
                  <p className="mt-2 text-[12px] leading-5 text-black/55">Les og huk av for å bekrefte at du har forstått dette:</p>
                  <div className="mt-5 grid gap-4 text-[12px] leading-[1.65] text-[#484b44]">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input type="checkbox" name="loanAcknowledged" required className="mt-1 h-4 w-4 shrink-0 accent-[#2f372c]" />
                      <span><strong>Utlån og retur.</strong> Jeg forstår at RE:MIND-enheten og tilhørende ramme kun er til utlån, fortsatt tilhører RE:MIND og skal returneres når RE:MIND ber om det, senest når pilotperioden avsluttes.</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input type="checkbox" name="prototypeAcknowledged" required className="mt-1 h-4 w-4 shrink-0 accent-[#2f372c]" />
                      <span><strong>Utviklingsprototype.</strong> Jeg forstår at dette er en uferdig, ikke CE-merket utviklingsprototype som kun skal brukes i pilottesten og etter sikkerhetsinstruksene jeg får.</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input type="checkbox" name="feedbackAcknowledged" required className="mt-1 h-4 w-4 shrink-0 accent-[#2f372c]" />
                      <span><strong>Tilbakemeldinger.</strong> Jeg vil bruke produktet aktivt og gi ærlige tilbakemeldinger. RE:MIND kan kontakte meg om pilottesten og om praktiske forhold rundt levering og retur.</span>
                    </label>
                  </div>
                </div>

                <p className="rounded-xl bg-[#f1f0e9] p-4 text-[11px] leading-5 text-[#66695f]">Opplysningene brukes til å organisere pilottesten, sende og hente tilbake låneenheten og kontakte deg om testen. Ingen markedsføringspåmelding. Se <a href="/privacy?lang=no" className="underline underline-offset-2">personvernerklæringen</a>.</p>
                <label className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
                {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] text-red-800">{error}</p>}
                {demoMode ? <p className="text-[12px] text-[#866e36]">Forhåndsvisning. Innsending er deaktivert.</p> : null}
                <button type="submit" disabled={sending || demoMode} className="h-13 rounded-xl bg-[#292c27] px-5 py-3.5 text-[13px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50">
                  {sending ? 'Lagrer bekreftelsen …' : 'Bekreft deltakelse →'}
                </button>
                <p className="text-center text-[11px] text-black/40">Ingen betaling · Kun utlån · Rammevalg kommer i en ny e-post</p>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
