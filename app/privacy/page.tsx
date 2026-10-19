'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase'
import ShopLegalPage from '../components/ShopLegalPage'

type AppLanguage = 'en' | 'no'

export default function PrivacyPage() {
  return (
    <Suspense fallback={null}>
      <PrivacyPageContent />
    </Suspense>
  )
}

function PrivacyPageContent() {
  const router = useRouter()
  const sp = useSearchParams()
  const from = sp.get('from')
  const queryLanguage = sp.get('lang')

  const [language, setLanguage] = useState<AppLanguage>(queryLanguage === 'no' ? 'no' : 'en')

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  function goBack() {
    if (from === 'settings') router.replace('/?tab=settings&nosplash=1')
    else router.back()
  }

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const updateFades = () => {
      const { scrollTop, scrollHeight, clientHeight } = el

      const atTop = scrollTop <= 0
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1

      setShowTopFade(!atTop)
      setShowBottomFade(!atBottom)
    }

    updateFades()

    el.addEventListener('scroll', updateFades)
    window.addEventListener('resize', updateFades)

    return () => {
      el.removeEventListener('scroll', updateFades)
      window.removeEventListener('resize', updateFades)
    }
  }, [])

  useEffect(() => {
    if (queryLanguage === 'no' || queryLanguage === 'en') {
      setLanguage(queryLanguage)
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        const activeDeviceId =
          typeof window !== 'undefined' ? localStorage.getItem('activeDeviceId') : null

        if (!activeDeviceId) return

        const { data, error } = await supabase
          .from('device_settings')
          .select('settings_json')
          .eq('device_id', activeDeviceId)
          .maybeSingle()

        if (error || cancelled) return

        const nextLang = data?.settings_json?.language
        if (nextLang === 'no' || nextLang === 'en') {
          setLanguage(nextLang)
        }
      } catch {
        // keep english fallback
      }
    })()

    return () => {
      cancelled = true
    }
  }, [queryLanguage])

  const pageTitle = language === 'no' ? 'PERSONVERNERKLÆRING' : 'PRIVACY POLICY'
  const updatedText =
    language === 'no' ? 'Sist oppdatert: 19. oktober 2026' : 'Last updated: October 19, 2026'

  const sections =
    language === 'no'
      ? [
          {
            title: 'OPPLYSNINGER VI SAMLER INN',
            text: 'Vi samler inn kontoinformasjon, som e-postadresse, enhetsdata som innstillinger og konfigurasjon, samt innhold du oppretter selv, som påminnelser og preferanser.',
          },
          {
            title: 'INNHOLD DU OPPRETTER',
            text: (
              <>
                RE:MIND kan behandle innhold du selv velger å legge inn, som påminnelser, preferanser og forespørsler til AI Follow, for å levere funksjonene du ber om. Ikke legg inn passord, betalingsinformasjon, fødselsnummer, helseopplysninger eller annen svært sensitiv eller konfidensiell informasjon.
                <br /><br />
                Legg bare inn personopplysninger om andre dersom du har rett til å gjøre det. Du kan slette innhold du har opprettet gjennom appen der denne funksjonen er tilgjengelig, eller kontakte oss for hjelp.
              </>
            ),
          },
          {
            title: 'GOOGLE CALENDAR – TILGANG OG FORMÅL',
            text: 'Hvis du selv velger å koble Google Calendar til RE:MIND via Connect, ber vi om lesetilgang til Google-kalendere du har tilgang til (Google Calendar API: calendar.readonly). Vi henter kommende hendelser fra kalendere som er valgt for visning i Google, inkludert hendelsestittel, dato, start- og sluttid, heldagsstatus, kalendernavn, sted og lenke til hendelsen der dette finnes. Informasjonen brukes til å synkronisere og vise kalenderavtaler som påminnelser i RE:MIND. Vi kan ikke opprette, endre eller slette hendelser i Google Calendar.',
          },
          {
            title: 'GOOGLE CALENDAR – LAGRING OG SYNLIGHET',
            text: 'Google-tilkoblingens tilgangs- og oppdateringstokens lagres kryptert på serveren. Importerte kalenderopplysninger mellomlagres i RE:MINDs database slik at de kan vises i appen og på rammen, også mellom synkroniseringer. En RE:MIND-ramme som deles i en husstand, kan vise avtalene til alle som kan se skjermen eller har tilgang til den delte rammen. Koble derfor bare til kalendere med opplysninger du ønsker å vise der. Vi bruker ikke Google Calendar-opplysninger til annonsering, selger dem ikke og bruker dem ikke til å trene generelle KI-modeller. Kalenderhendelser sendes ikke til AI Follow eller ekstern KI-basert tittelforkorting.',
          },
          {
            title: 'GOOGLE CALENDAR – FRAKOBLING OG SLETTING',
            text: 'Du kan når som helst koble fra Google Calendar i Connect. RE:MIND stanser da videre synkronisering og sletter lagrede Google-tilgangstokens og importerte kalenderhendelser fra den aktive integrasjonsdatabasen. Dette endrer ikke kalenderne dine hos Google. Du kan også trekke tilbake RE:MINDs tilgang fra sikkerhetsinnstillingene i Google-kontoen din. For andre forespørsler om sletting, kontakt support@re-mind.no.',
          },
          {
            title: 'GOOGLE API-DATA OG BEGRENSET BRUK',
            text: 'RE:MINDs bruk og eventuell overføring av opplysninger mottatt fra Google API-er følger Google API Services User Data Policy, inkludert kravene til Limited Use (begrenset bruk). Google-data brukes kun til den kalenderfunksjonen du uttrykkelig har koblet til, og deles bare med nødvendige tekniske tjenesteleverandører for å levere og sikre funksjonen eller når loven krever det.',
          },
          {
            title: 'EKSTERN KI-BEHANDLING FOR AI FOLLOW',
            text: 'Når du bruker AI Follow, sendes forespørselen din og behandlet innhold som mål, søkeveiledning og tidligere relevante oppdateringer til OpenAI, en leverandør av KI-modeller. Dette er nødvendig for å tolke hva du vil følge med på og vurdere om offentlig tilgjengelig informasjon samsvarer med forespørselen. Forespørslene til leverandøren er konfigurert med lagring av svar slått av.',
          },
          {
            title: 'HVORDAN OPPLYSNINGENE BRUKES',
            text: 'Opplysningene brukes til å bekrefte brukerkontoen din, synkronisere med RE:MIND-enheten og levere appens grunnleggende funksjoner.',
          },
          {
            title: 'BEHANDLINGSGRUNNLAG',
            text: 'Vi behandler personopplysningene dine for å levere tjenesten og oppfylle avtalen med deg, samt for å vedlikeholde og forbedre RE:MIND-appen basert på vår berettigede interesse.',
          },
          {
            title: 'LAGRING',
            text: 'Opplysningene lagres ved hjelp av Supabase. Vi gjennomfører rimelige tekniske og organisatoriske tiltak for å beskytte informasjonen din.',
          },
          {
            title: 'LAGRINGSTID',
            text: 'Vi lagrer opplysningene så lenge kontoen din er aktiv. Du kan når som helst be om at opplysningene slettes.',
          },
          {
            title: 'INFORMASJONSKAPSLER',
            text: 'Vi bruker kun nødvendige informasjonskapsler for innlogging og grunnleggende funksjonalitet. Vi bruker ikke informasjonskapsler til sporing eller annonsering.',
          },
          {
            title: 'DELING AV OPPLYSNINGER',
            text: 'Vi selger ikke personopplysningene dine. Opplysninger deles bare med leverandører av teknisk infrastruktur når det er nødvendig for å levere tjenesten.',
          },
          {
            title: 'DINE RETTIGHETER',
            text: (
              <>
                Du kan be om innsyn i, retting eller sletting av personopplysningene dine. Du kan også{' '}
                kontakte <a href="https://www.datatilsynet.no/">Datatilsynet</a> dersom det er nødvendig.
              </>
            ),
          },
          {
            title: 'KONTAKT',
            text: (
              <>
                Har du spørsmål om personvern, kan du kontakte oss på{' '}
                <a href="mailto:support@re-mind.no">support@re-mind.no</a>
              </>
            ),
          },
        ]
      : [
          {
            title: 'WHAT WE COLLECT',
            text: 'We collect account information (email), device data (settings and configuration), and user-created content such as reminders and preferences.',
          },
          {
            title: 'USER-CREATED CONTENT',
            text: (
              <>
                RE:MIND may process content you choose to enter, such as reminders, preferences and AI Follow requests, to provide the features you ask for. Please do not enter passwords, payment information, national identification numbers, health information, or other highly sensitive or confidential information.
                <br /><br />
                Only provide personal data about other people when you have the right to do so. You can delete user-created content through the app where this functionality is available, or contact us for assistance.
              </>
            ),
          },
          {
            title: 'GOOGLE CALENDAR – ACCESS AND PURPOSE',
            text: 'If you choose to connect Google Calendar through RE:MIND Connect, we request read-only access to calendars available to your Google Account (Google Calendar API: calendar.readonly). We import upcoming events from calendars selected for display in Google, including event titles, dates, start and end times, all-day status, calendar names, locations and event links where available. We use this information to synchronize and display calendar entries as reminders in RE:MIND. We cannot create, edit or delete events in Google Calendar.',
          },
          {
            title: 'GOOGLE CALENDAR – STORAGE AND VISIBILITY',
            text: 'Google access and refresh tokens are stored encrypted on our server. Imported calendar details are cached in the RE:MIND database so they can appear in the app and on your frame between synchronizations. Events displayed on a shared household frame may be visible to anyone who can see the display or access the shared frame. Connect only calendars containing information you are comfortable showing there. We do not sell Google Calendar data, use it for advertising or use it to train general-purpose AI models. Calendar events are not sent to AI Follow or an external AI title-shortening service.',
          },
          {
            title: 'GOOGLE CALENDAR – DISCONNECTING AND DELETION',
            text: 'You may disconnect Google Calendar at any time in Connect. RE:MIND then stops future synchronization and deletes stored Google access tokens and imported calendar events from its active integration database. This does not change your calendars at Google. You may also revoke RE:MIND access in your Google Account security settings. For other data deletion requests, contact support@re-mind.no.',
          },
          {
            title: 'GOOGLE API DATA AND LIMITED USE',
            text: 'RE:MIND’s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Google data is used only to provide the calendar feature you expressly connect, and is shared only with technical service providers necessary to operate and protect that feature or when required by law.',
          },
          {
            title: 'EXTERNAL AI PROCESSING FOR AI FOLLOW',
            text: 'When you use AI Follow, your request and processed content such as goals, search guidance and previous relevant updates are sent to OpenAI, an AI model provider. This is necessary to interpret what you want to follow and assess whether publicly available information matches your request. Requests to the provider are configured with response storage disabled.',
          },
          {
            title: 'HOW WE USE DATA',
            text: 'Your data is used to authenticate your account, sync with your Frame device, and provide core app functionality.',
          },
          {
            title: 'LEGAL BASIS',
            text: 'We process your data to provide the service (contract) and to maintain and improve the App (legitimate interest).',
          },
          {
            title: 'STORAGE',
            text: 'Data is securely stored using Supabase. We take reasonable steps to protect your information.',
          },
          {
            title: 'DATA RETENTION',
            text: 'We store your data as long as your account is active. You may request deletion at any time.',
          },
          {
            title: 'COOKIES',
            text: 'We only use essential cookies required for authentication and core functionality. No tracking or advertising cookies are used.',
          },
          {
            title: 'SHARING',
            text: 'We do not sell your data. Data is only shared with infrastructure providers when necessary to operate the service.',
          },
          {
            title: 'YOUR RIGHTS',
            text: 'You may request access, correction, or deletion of your data. You can also contact Datatilsynet if needed.',
          },
          {
            title: 'CONTACT',
            text: <>For any privacy-related questions, contact <a href="mailto:support@re-mind.no">support@re-mind.no</a></>,
          },
        ]

  if (from === 'shop') {
    return (
      <ShopLegalPage
        title={pageTitle}
        updatedText={updatedText}
        sections={sections}
        backHref={language === 'no' ? '/shop?lang=no' : '/shop'}
        backLabel={language === 'no' ? 'TILBAKE TIL FORSIDEN' : 'Back to home'}
      />
    )
  }

  return (
    <main className="h-screen bg-[#061b24] text-white flex justify-center overflow-hidden">
      <div className="w-full max-w-[420px] px-5 pt-10 pb-6 flex flex-col min-h-0">
        <Header title={pageTitle} onBack={goBack} />

        <div className="relative mt-6 flex-1 min-h-0">
          <div
            ref={scrollerRef}
            className="h-full overflow-y-auto pr-1 pb-6 text-white/70 leading-relaxed space-y-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <p>{updatedText}</p>

            {sections.map((section) => (
              <section key={section.title} className="space-y-3">
                <div className="pt-4 border-t border-white/10">
                  <p className="text-white/80 tracking-[0.18em] text-xs">{section.title}</p>
                </div>
                <p>{section.text}</p>
              </section>
            ))}
          </div>

          {showTopFade && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[#061b24] to-transparent" />
          )}

          {showBottomFade && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#061b24] to-transparent" />
          )}
        </div>
      </div>
    </main>
  )
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between shrink-0">
      <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-white/60 text-3xl">
        ‹
      </button>
      <div className="text-center flex-1">
        <div className="text-xl font-semibold tracking-widest">{title}</div>
      </div>
      <div className="w-10 h-10" />
    </div>
  )
}
