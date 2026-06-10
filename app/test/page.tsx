import type { Metadata } from 'next'
import { ShopFadeImage, ShopReveal } from '../shop/ShopMotion'
import WaitlistForm from '../shop/WaitlistForm'

export const metadata: Metadata = {
  title: 'RE:MIND interesseliste',
  description: 'Skriv deg på interesselisten for RE:MIND, en rolig digital ramme for familier med påminnelser, vær og kalender.',
}

type BenefitIconProps = {
  className?: string
}

const iconStroke = 'currentColor'

function ChecklistIcon({ className }: BenefitIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.2 7.3l1.5 1.5 2.6-3" stroke={iconStroke} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.2 7.2h7.2" stroke={iconStroke} strokeWidth="1.35" strokeLinecap="round" />
      <path d="M5.2 12l1.5 1.5 2.6-3" stroke={iconStroke} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.2 12h7.2" stroke={iconStroke} strokeWidth="1.35" strokeLinecap="round" />
      <path d="M5.2 16.7l1.5 1.5 2.6-3" stroke={iconStroke} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.2 16.8h7.2" stroke={iconStroke} strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}

function CalendarWeatherIcon({ className }: BenefitIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.7 5.4h8.8a2 2 0 012 2v9.1a2 2 0 01-2 2H6.7a2 2 0 01-2-2V7.4a2 2 0 012-2z" stroke={iconStroke} strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M8.2 3.8v3M14 3.8v3M4.7 9h12.8" stroke={iconStroke} strokeWidth="1.25" strokeLinecap="round" />
      <path d="M9.1 13.7h.1M12 13.7h.1M9.1 16h.1" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17.4 13.2a2.5 2.5 0 100-5" stroke={iconStroke} strokeWidth="1.25" strokeLinecap="round" />
      <path d="M19.9 6.2l.7-.8M21 10.7h1.1M19.8 15.2l.7.8" stroke={iconStroke} strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

function HomeFrameIcon({ className }: BenefitIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.6 11.1L12 5l7.4 6.1" stroke={iconStroke} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.7 10.2v8.1h10.6v-8.1" stroke={iconStroke} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.2 12.1h5.6v4.1H9.2z" stroke={iconStroke} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M10.3 14.2h3.4" stroke={iconStroke} strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

const benefits = [
  {
    title: 'Hverdagen på et blikk',
    text: 'Se det familien trenger før dere går ut døren.',
    Icon: ChecklistIcon,
  },
  {
    title: 'Mindre mobil',
    text: 'Få med deg viktige ting uten å åpne enda en app.',
    Icon: CalendarWeatherIcon,
  },
  {
    title: 'Laget for hjemmet',
    text: 'Rolig design som passer inn, ikke roper etter oppmerksomhet.',
    Icon: HomeFrameIcon,
  },
]

const waitlistFormProps = {
  source: 'test-landing',
  page: '/test',
  heading: 'Skriv deg på interesselisten',
  intro: '',
  buttonText: 'Skriv deg på interesselisten',
  helperText: 'Ingen betaling. Ingen spam. Bare ærlige oppdateringer.',
  successMessage: 'Tusen takk! Du er nå på interesselisten for RE:MIND.',
  formClassName: 'mt-0',
  namePlaceholder: 'Navn (valgfritt)',
  emailPlaceholder: 'E-post',
  compactEmailPlaceholder: 'E-postadressen din',
  submittingText: 'Sender...',
  genericErrorMessage: 'Noe gikk galt. Prøv igjen.',
}

export default function TestLandingPage() {
  return (
    <main
      className="shop-page waitlist-page min-h-screen bg-[#f6f3ed] text-[#171512]"
      style={{
        marginTop: 'calc(env(safe-area-inset-top) * -1)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <header className="border-b border-black/8 bg-[#f6f3ed]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5 md:px-10">
          <a href="/test" className="text-[24px] font-medium tracking-[0.28em] text-black/90 md:text-[29px]">
            RE:MIND
          </a>
          <a
            href="#early-access"
            className="shop-button rounded-full bg-[#171512] px-4 py-2 text-[12px] font-medium tracking-[0.08em] text-white shadow-[0_10px_24px_rgba(0,0,0,0.12)]"
          >
            Interesseliste
          </a>
        </div>
      </header>

      <section className="px-5 pb-5 pt-5 md:px-10 md:pb-10 md:pt-12">
        <div className="mx-auto grid max-w-[1180px] gap-6 lg:grid-cols-[minmax(0,1.02fr)_minmax(360px,0.98fr)] lg:items-center lg:gap-12">
          <ShopReveal>
            <div className="flex flex-col gap-4 md:gap-5">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-black/45">RE:MIND</p>
                <h1 className="mt-3 max-w-[680px] text-[34px] font-medium leading-[1.03] tracking-[-0.052em] text-[#15120f] sm:text-[48px] md:text-[64px]">
                  En rolig digital ramme for familien
                </h1>
                <p className="mt-4 max-w-[46ch] text-[18px] leading-[1.45] text-black/64 md:mt-5 md:text-[22px]">
                  Påminnelser, vær og kalender — lett synlig hjemme, uten å sjekke mobilen.
                </p>
              </div>

              <div
                id="early-access"
                className="scroll-mt-6 rounded-[28px] border border-black/10 bg-[#fffdf9] p-4 shadow-[0_24px_70px_rgba(73,54,34,0.12)] sm:p-6 md:max-w-[430px]"
              >
                <WaitlistForm {...waitlistFormProps} />
              </div>
            </div>
          </ShopReveal>

          <ShopReveal delayMs={80}>
            <div className="relative overflow-hidden rounded-[34px] border border-black/10 bg-[#eee7dc] shadow-[0_30px_80px_rgba(73,54,34,0.18)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.72),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.38),transparent_52%)]" />
              <div className="relative aspect-[4/3] min-h-[300px] md:min-h-[520px]">
                <ShopFadeImage
                  src="/shop/hero-top.png"
                  alt="RE:MIND-ramme i et rolig hjemmemiljø"
                  fill
                  priority
                  sizes="(min-width: 1024px) 48vw, 100vw"
                  className="object-cover object-center"
                />
              </div>
              <div className="absolute bottom-4 left-4 right-4 rounded-[22px] border border-white/45 bg-white/75 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.10)] backdrop-blur md:bottom-6 md:left-6 md:right-auto md:max-w-[315px]">
                <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-black/45">BLI MED FRA STARTEN</p>
                <p className="mt-2 text-[15px] leading-[1.45] text-black/70">
                  Påminnelser, vær og kalender — lett synlig i gangen.
                </p>
              </div>
            </div>
          </ShopReveal>
        </div>
      </section>

      <section className="px-5 pb-5 pt-3 md:px-10 md:pb-12 md:pt-8" aria-labelledby="test-benefits">
        <div className="mx-auto max-w-[1180px]">
          <h2 id="test-benefits" className="sr-only">Fordeler med RE:MIND</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {benefits.map(({ Icon, ...benefit }, index) => (
              <ShopReveal key={benefit.title} delayMs={index * 55}>
                <article className="shop-card h-full rounded-[26px] border border-black/10 bg-[#fffaf2] p-4 shadow-[0_16px_40px_rgba(73,54,34,0.08)] sm:p-5 md:p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#e7d8c4] text-[#5f5143]/75 md:mb-6" aria-hidden="true">
                    <Icon className="h-[22px] w-[22px]" />
                  </div>
                  <h3 className="text-[20px] font-medium tracking-[-0.02em] text-black/85">{benefit.title}</h3>
                  <p className="mt-2.5 max-w-[30ch] text-[15px] leading-[1.55] text-black/58 md:mt-3">{benefit.text}</p>
                </article>
              </ShopReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-7 md:px-10 md:py-14" aria-labelledby="founder-note">
        <ShopReveal>
          <div className="mx-auto max-w-[900px] rounded-[32px] border border-black/10 bg-[#fffdf9] p-5 shadow-[0_24px_70px_rgba(73,54,34,0.10)] sm:p-7 md:p-10">
            <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-black/42">Fra Stavanger</p>
            <h2 id="founder-note" className="mt-3 text-[28px] font-medium leading-[1.08] tracking-[-0.04em] text-[#15120f] md:text-[42px]">
              En liten hilsen fra grunnleggeren
            </h2>

            <div className="mt-6 space-y-4 text-[16px] leading-[1.7] text-black/66 md:text-[18px]">
              <p>Hei, jeg heter Vetle, grunnlegger av RE:MIND — et lite prosjekt fra Stavanger.</p>

              <p>
                Jeg utviklet først RE:MIND for å se surfeforholdene på vei ut døren hjemme. Etter hvert oppdaget jeg at det var flere ting jeg gjerne ville få med meg i farten — uten å måtte sjekke mobilen.
              </p>

              <p>
                Blir det regn i dag? Bør jeg ta med paraply? Er vi snart tomme for noe i kjøleskapet? Og ikke minst: Husk at dunken må ut i veien for tømming i dag.
              </p>

              <p>
                Siden har RE:MIND vokst til en rolig digital ramme for familier. Den kan vise påminnelser, vær, kalender og kobles til tjenester som Spond, Teams og Transponder.
              </p>

              <div className="rounded-[24px] bg-[#f4ecdf] p-4 text-black/70 md:p-5">
                <p className="font-medium text-[#171512]">Tanken er enkel:</p>
                <p className="mt-2">
                  Få med deg det som betyr noe i hverdagen — uten støy. Fotballtreningen til Sander er flyttet til 18:00, eller at Mari må huske badedrakt til gymmen i morgen.
                </p>
              </div>

              <p>
                Hvis du synes RE:MIND virker nyttig, og har lyst til å følge reisen videre, setter jeg stor pris på om du skriver deg opp på interesselisten. Da får du oppdateringer om fremgang, lanseringsdato og et eget introduksjonstilbud som takk for at du ble med tidlig.
              </p>
            </div>

            <div className="mt-7 flex flex-col gap-4 rounded-[24px] border border-black/8 bg-[#f8f1e8] p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
              <p className="text-[13px] font-medium leading-[1.5] text-black/58">
                Ingen betaling. Ingen spam. Bare ærlige oppdateringer fra utviklingen.
              </p>
              <a
                href="#early-access"
                className="shop-button inline-flex w-full items-center justify-center rounded-full bg-[#171512] px-5 py-3 text-sm font-medium text-white shadow-[0_12px_28px_rgba(0,0,0,0.13)] sm:w-auto"
              >
                Skriv meg på interesselisten
              </a>
            </div>
          </div>
        </ShopReveal>
      </section>

      <footer className="px-5 pb-8 pt-2 text-center md:px-10 md:pb-10">
        <p className="text-[13px] leading-[1.5] text-black/45">RE:MIND utvikles i Stavanger av Vetle Norstad.</p>
      </footer>
    </main>
  )
}
