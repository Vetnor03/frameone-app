'use client'

import { useState, type FormEvent } from 'react'

const inputClass = 'h-11 w-full rounded-xl border border-[#d9d7d1] bg-white px-3.5 text-[16px] text-[#242522] outline-none transition focus:border-[#33352f] focus:ring-2 focus:ring-[#33352f]/10'
const labelClass = 'grid gap-1.5 text-[12px] font-medium text-[#4d5149]'

export default function PilotApplication() {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending) return
    setSending(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const payload = {
      fullName: String(form.get('fullName') || ''),
      email: String(form.get('email') || ''),
      city: String(form.get('city') || ''),
      household: String(form.get('household') || ''),
      platform: String(form.get('platform') || ''),
      homeWifi: String(form.get('homeWifi') || ''),
      useCase: String(form.get('useCase') || ''),
      note: String(form.get('note') || ''),
      prototypeAcknowledged: form.get('prototypeAcknowledged') === 'on',
      returnAcknowledged: form.get('returnAcknowledged') === 'on',
      feedbackAcknowledged: form.get('feedbackAcknowledged') === 'on',
      followUpInterviewOptIn: form.get('followUpInterviewOptIn') === 'on',
      website: String(form.get('website') || ''),
    }
    try {
      const response = await fetch('/api/pilot/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Kunne ikke lagre påmeldingen. Prøv igjen.')
      setSent(true)
    } catch {
      setError('Noe gikk galt. Prøv igjen eller kontakt support@re-mind.no.')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="pilot-page min-h-screen bg-[#f3f1ec] px-4 pb-14 text-[#242522] sm:px-6">
      <header className="mx-auto flex h-16 max-w-[1080px] items-center justify-between border-b border-black/10">
        <a href="https://re-mind.no" className="text-[19px] font-semibold tracking-[.16em]">RE:MIND</a>
        <span className="text-[10px] font-semibold uppercase tracking-[.19em] text-black/45">Første pilottest</span>
      </header>

      <div className="mx-auto grid max-w-[1080px] gap-9 pt-10 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-14 lg:pt-20">
        <section className="lg:sticky lg:top-12">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[.22em] text-[#76786e]">En liten invitasjon</p>
          <h1 className="max-w-xl text-[clamp(36px,4.3vw,55px)] font-medium leading-[1.06] tracking-[-.055em]">Vil du bli den første til å teste RE:MIND?</h1>
          <p className="mt-6 max-w-[460px] text-[15px] leading-7 text-[#5e6159]">Vi nærmer oss vår første test i ekte hjem. Vi søker fem personer som vil låne en tidlig RE:MIND, bruke den i hverdagen og fortelle oss hva som fungerer — og hva som bør bli bedre.</p>
          <div className="mt-7 grid grid-cols-3 gap-2">
            {[['05', 'testere'], ['03', 'uker'], ['50 %', 'takk for hjelpen']].map(([number, caption]) => (
              <div key={number} className="rounded-xl border border-black/10 bg-white/55 px-3 py-4">
                <p className="text-[27px] font-medium tracking-[-.06em]">{number}</p>
                <p className="mt-1 text-[11px] text-black/50">{caption}</p>
              </div>
            ))}
          </div>
          <div className="mt-7 rounded-2xl border border-[#ded5c0] bg-[#ede6d8] p-4 text-[12px] leading-5 text-[#514a3e]">
            <p className="font-semibold">Dette er en utviklingsprototype, ikke et ferdig produkt.</p>
            <p className="mt-1">Testenheten er ikke CE-merket eller ferdig samsvarsvurdert. Den lånes ut for en begrenset test og skal leveres tilbake. Hvis du blir valgt, får du egen informasjon om risiko, bruksbegrensninger og lånevilkår før du eventuelt takker ja. Ingen enheter sendes ut før testopplegget er avklart.</p>
          </div>
        </section>

        <section className="rounded-[22px] border border-black/10 bg-[#fcfbf8] p-5 shadow-[0_16px_50px_rgba(40,38,33,.045)] sm:p-8">
          {sent ? (
            <div className="flex min-h-[480px] flex-col justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#242522] text-xl text-white">✓</div>
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[.17em] text-black/40">Påmeldingen er mottatt</p>
              <h2 className="mt-3 text-[30px] font-medium leading-tight tracking-[-.04em]">Takk for interessen!</h2>
              <p className="mt-4 text-[14px] leading-6 text-black/55">Vi tar kontakt på e-post hvis du blir valgt ut. Påmeldingen er ikke en bestilling eller en avtale om å motta en testpakke.</p>
              <a href="https://re-mind.no" className="mt-8 self-start rounded-xl bg-[#242522] px-5 py-3 text-[13px] font-medium text-white">Tilbake til RE:MIND</a>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-4">
              <div className="mb-1">
                <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-black/40">Påmelding · omtrent 2 minutter</p>
                <h2 className="mt-2 text-[27px] font-medium tracking-[-.04em]">Fortell oss litt om deg</h2>
                <p className="mt-1.5 text-[12px] leading-5 text-black/50">Vi trenger bare noen få opplysninger nå. Leveringsadresse spør vi først om dersom du blir valgt.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>Navn <input className={inputClass} name="fullName" autoComplete="name" required maxLength={100} placeholder="Fullt navn" /></label>
                <label className={labelClass}>E-post <input className={inputClass} name="email" type="email" autoComplete="email" required maxLength={200} placeholder="deg@eksempel.no" /></label>
              </div>
              <label className={labelClass}>Hvor bor du? <input className={inputClass} name="city" autoComplete="address-level2" required maxLength={80} placeholder="By eller kommune" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>Hvem vil bruke rammen?
                  <select className={inputClass} name="household" required defaultValue=""><option value="" disabled>Velg</option><option value="me">Hovedsakelig meg</option><option value="shared">Flere i husstanden</option></select>
                </label>
                <label className={labelClass}>Hvilken telefon bruker du?
                  <select className={inputClass} name="platform" required defaultValue=""><option value="" disabled>Velg</option><option value="ios">iPhone</option><option value="android">Android</option><option value="both">Begge deler</option></select>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>Har du Wi-Fi hjemme?
                  <select className={inputClass} name="homeWifi" required defaultValue=""><option value="" disabled>Velg</option><option value="yes">Ja</option><option value="no">Nei</option><option value="unsure">Usikker</option></select>
                </label>
                <label className={labelClass}>Hva vil du helst bruke RE:MIND til?
                  <select className={inputClass} name="useCase" required defaultValue=""><option value="" disabled>Velg</option><option value="reminders">Påminnelser</option><option value="calendar">Kalender og avtaler</option><option value="weather_news">Vær og nyheter</option><option value="mixed">Litt av alt</option><option value="other">Annet</option></select>
                </label>
              </div>
              <label className={labelClass}>Noe annet vi bør vite? <span className="font-normal text-black/40">(valgfritt)</span>
                <textarea className="min-h-[76px] w-full resize-y rounded-xl border border-[#d9d7d1] bg-white p-3.5 text-[14px] outline-none focus:border-[#33352f] focus:ring-2 focus:ring-[#33352f]/10" name="note" maxLength={400} placeholder="For eksempel hvordan du ser for deg å bruke rammen." />
              </label>
              <div className="mt-1 space-y-3 border-t border-black/10 pt-5 text-[12px] leading-5">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.13em] text-black/50">Må godtas for å sende inn</p>
                <label className="flex items-start gap-3"><input type="checkbox" name="prototypeAcknowledged" required className="mt-1 h-4 w-4 shrink-0 accent-[#242522]" /><span>Jeg forstår at dette er en uferdig utviklingsprototype som ikke er CE-merket eller ferdig samsvarsvurdert, og at påmelding ikke garanterer deltakelse. Endelige testvilkår og sikkerhetsinstrukser gis før et eventuelt utlån.</span></label>
                <label className="flex items-start gap-3"><input type="checkbox" name="returnAcknowledged" required className="mt-1 h-4 w-4 shrink-0 accent-[#242522]" /><span>Jeg forstår at testen varer omtrent tre uker, at enheten tilhører RE:MIND og at den skal returneres etter testperioden eller dersom testen avbrytes.</span></label>
                <label className="flex items-start gap-3"><input type="checkbox" name="feedbackAcknowledged" required className="mt-1 h-4 w-4 shrink-0 accent-[#242522]" /><span>Jeg kan gi ærlige tilbakemeldinger underveis og svare på et kort spørreskjema etter testen.</span></label>
              </div>
              <div className="rounded-xl border border-black/10 bg-white px-4 py-3 text-[12px] leading-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.13em] text-black/50">Valgfritt</p>
                <label className="flex items-start gap-3"><input type="checkbox" name="followUpInterviewOptIn" className="mt-1 h-4 w-4 shrink-0 accent-[#242522]" /><span>Jeg kan også kontaktes om en kort oppfølgingssamtale om opplevelsen min. Jeg kan si nei senere, og dette påvirker ikke påmeldingen.</span></label>
              </div>
              <p className="rounded-xl bg-[#f0eee8] px-4 py-3 text-[11px] leading-5 text-black/55">Som takk for en gjennomført test, tilbakemeldinger og retur av låneenheten får du tilbud om <strong>50 % rabatt på én ferdig RE:MIND ved lansering</strong>. Ingen kjøpsplikt. Rabatt gjelder sluttproduktet, ikke prototypen.</p>
              <p className="text-[11px] leading-5 text-black/45">Vi bruker opplysningene til å vurdere søknader og kontakte deltakere om piloten, ikke til å melde deg på markedsføring. Du kan be om innsyn eller sletting via <a className="underline underline-offset-2" href="mailto:support@re-mind.no">support@re-mind.no</a>. Se <a className="underline underline-offset-2" href="/privacy?lang=no">personvernerklæringen</a>.</p>
              <label className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
              {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-800">{error}</p>}
              <button type="submit" disabled={sending} className="mt-1 h-12 rounded-xl bg-[#242522] px-5 text-[13px] font-semibold text-white transition hover:bg-black disabled:opacity-50">{sending ? 'Sender påmelding…' : 'Meld meg som testbruker →'}</button>
              <p className="text-center text-[11px] text-black/40">Ingen betaling. Ingen bestilling. Kun påmelding.</p>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
