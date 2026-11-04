'use client'

import { useEffect, useState, type FormEvent } from 'react'

type Invitation = { confirmed: boolean }
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

function Agreement({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/8 bg-white px-4 py-3.5 text-[13px] leading-6 text-[#454842]">
      <input type="checkbox" name={name} required className="mt-1 h-4 w-4 shrink-0 accent-[#2f372c]" />
      <span>{children}</span>
    </label>
  )
}

export default function PilotConfirmation({ inviteId }: { inviteId: string }) {
  const [view, setView] = useState<ViewState>('loading')
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [invalidReason, setInvalidReason] = useState('')
  const [formComplete, setFormComplete] = useState(false)

  useEffect(() => {
    if (!inviteId) {
      setInvalidReason('Bruk lenken du fikk på e-post fra RE:MIND.')
      setView('invalid')
      return
    }
    const controller = new AbortController()
    fetch('/api/pilot/confirm?invite=' + encodeURIComponent(inviteId), {
      cache: 'no-store', signal: controller.signal,
    })
      .then(async (response) => {
        const data: unknown = await response.json().catch(() => null)
        if (!response.ok || !data || typeof data !== 'object' || !('confirmed' in data) || typeof data.confirmed !== 'boolean') {
          const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error : 'Lenken kunne ikke bekreftes.'
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
        setInvalidReason(reason instanceof Error ? reason.message : 'Kunne ikke åpne siden.')
        setView('invalid')
      })
    return () => controller.abort()
  }, [inviteId])

  function scrollToFirstInvalid(form: HTMLFormElement) {
    const firstInvalid = Array.from(form.elements).find(
      (element): element is HTMLInputElement =>
        element instanceof HTMLInputElement &&
        element.willValidate &&
        !element.checkValidity(),
    )
    if (!firstInvalid) return
    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => firstInvalid.focus({ preventScroll: true }), 250)
  }

  function updateFormComplete(form: HTMLFormElement) {
    setFormComplete(form.checkValidity())
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending || !invitation) return
    if (!event.currentTarget.checkValidity()) {
      setFormComplete(false)
      scrollToFirstInvalid(event.currentTarget)
      return
    }
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
          participationAcknowledged: form.get('participationAcknowledged') === 'on',
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


  return (
    <main className="pilot-page min-h-screen bg-[#f3f1ec] text-[#292b26]">
      <div className="mx-auto max-w-[720px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <header className="flex items-center justify-between border-b border-black/10 pb-5">
          <a href="https://re-mind.no" className="text-[18px] font-semibold tracking-[.16em]">RE:MIND</a>
          <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-black/40">Pilottest 2026</span>
        </header>

        <section className="mt-8 rounded-[22px] border border-black/10 bg-[#fcfbf8] p-5 shadow-[0_18px_50px_rgba(40,38,33,.04)] sm:p-8">
          {view === 'loading' ? (
            <div role="status" className="flex min-h-[260px] items-center justify-center text-[14px] text-black/50">
              Åpner bekreftelsen …
            </div>
          ) : view === 'invalid' ? (
            <div className="flex min-h-[260px] flex-col justify-center">
              <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-black/40">RE:MIND pilot</p>
              <h1 className="mt-3 text-[31px] font-medium leading-tight tracking-[-.04em]">Denne lenken er ikke gyldig.</h1>
              <p role="alert" className="mt-4 text-[14px] leading-6 text-black/60">{invalidReason}</p>
              <p className="mt-4 text-[13px] leading-6 text-black/50">
                Trenger du hjelp? Skriv til <a className="underline underline-offset-2" href="mailto:support@re-mind.no">support@re-mind.no</a>.
              </p>
            </div>
          ) : view === 'done' ? (
            <div className="flex min-h-[330px] flex-col justify-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#343b2e] text-[23px] text-white" aria-hidden="true">✓</span>
              <h1 className="mt-6 text-[34px] font-medium leading-tight tracking-[-.045em]">Alt er i orden.</h1>
              <p className="mt-4 text-[15px] leading-7 text-black/65">
                Vi har registrert at du vil være testbruker og mottatt leveringsinformasjonen din. Du får også en kort bekreftelse på e-post.
              </p>
              <div className="mt-6 rounded-xl bg-[#f0f2eb] p-4 text-[13px] leading-6 text-[#46503e]">
                <strong>Du trenger ikke gjøre noe mer nå.</strong> Mer informasjon kommer i en ny e-post, blant annet om neste steg og hvordan du velger utseendet på din RE:MIND.
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} onInput={(event) => updateFormComplete(event.currentTarget)} onChange={(event) => updateFormComplete(event.currentTarget)} noValidate className="grid gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-black/40">RE:MIND pilot</p>
                <h1 className="mt-2 text-[34px] font-medium leading-tight tracking-[-.045em]">Bekreft at du vil være med</h1>
                <p className="mt-3 max-w-[580px] text-[14px] leading-6 text-black/58">
                  Fyll inn hvor vi skal sende RE:MIND, og godta punktene under. Etterpå får du en kort bekreftelse på e-post. Mer informasjon om piloten kommer senere.
                </p>
              </div>

              <div className="grid gap-4">
                <h2 className="text-[16px] font-semibold">Kontakt og adresse</h2>
                <Field label="Fullt navn" name="fullName" autoComplete="name" maxLength={100} placeholder="Fornavn og etternavn" />
                <Field label="Telefonnummer" name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={25} pattern="[+0-9 ()-]{8,25}" placeholder="123 45 678" />
                <Field label="Adresse" name="addressLine1" autoComplete="address-line1" maxLength={160} placeholder="Gateadresse og husnummer" />
                <Field label="Leilighet, etasje eller c/o" name="addressLine2" autoComplete="address-line2" maxLength={160} required={false} placeholder="Tilleggsinformasjon" />
                <div className="grid grid-cols-[minmax(115px,.7fr)_minmax(0,1.3fr)] gap-4">
                  <Field label="Postnummer" name="postalCode" autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="0000" />
                  <Field label="Poststed" name="city" autoComplete="address-level2" maxLength={100} placeholder="Poststed" />
                </div>
              </div>

              <div className="grid gap-3 border-t border-black/10 pt-6">
                <h2 className="text-[16px] font-semibold">Bekreftelser</h2>
                <Agreement name="participationAcknowledged">
                  Jeg ønsker å delta som testbruker i RE:MIND-piloten.
                </Agreement>
                <Agreement name="loanAcknowledged">
                  Jeg forstår at enheten kun er til låns, fortsatt tilhører RE:MIND og må returneres når RE:MIND ber om det eller når piloten avsluttes.
                </Agreement>
                <Agreement name="prototypeAcknowledged">
                  Jeg forstår at dette er en utviklingsprototype og at jeg skal følge informasjonen og sikkerhetsinstruksene jeg får under testen.
                </Agreement>
                <Agreement name="feedbackAcknowledged">
                  Jeg godtar å bruke produktet i testperioden, gi ærlige tilbakemeldinger og bli kontaktet om praktiske forhold rundt piloten.
                </Agreement>
              </div>

              <p className="text-[11px] leading-5 text-black/45">
                Opplysningene brukes kun til å gjennomføre pilottesten, sende og hente tilbake låneenheten og kontakte deg om testen. Se <a href="/privacy?lang=no" className="underline underline-offset-2">personvernerklæringen</a>.
              </p>

              <label className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
                Website <input name="website" tabIndex={-1} autoComplete="off" />
              </label>

              {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] text-red-800">{error}</p>}

              <button
                type="submit"
                disabled={sending}
                aria-disabled={!formComplete || sending}
                className={
                  'rounded-xl px-5 py-3.5 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ' +
                  (formComplete
                    ? 'bg-[#292c27] text-white hover:bg-black'
                    : 'cursor-pointer bg-[#deddd8] text-black/40')
                }
              >
                {sending ? 'Lagrer …' : 'Godta og bekreft'}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
