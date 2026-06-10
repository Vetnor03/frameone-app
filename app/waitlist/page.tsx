import type { Metadata } from 'next'
import { ShopFadeImage, ShopReveal } from '../shop/ShopMotion'
import WaitlistForm from '../shop/WaitlistForm'

export const metadata: Metadata = {
  title: 'RE:MIND Early Access Waitlist',
  description: 'Join the RE:MIND early access waitlist for a calm digital frame with family reminders, weather, and calendar updates.',
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
    title: 'Family reminders',
    text: 'Keep everyday tasks visible where everyone sees them.',
    Icon: ChecklistIcon,
  },
  {
    title: 'Weather and calendar',
    text: 'Know what matters before leaving the house.',
    Icon: CalendarWeatherIcon,
  },
  {
    title: 'Designed for the home',
    text: 'A quiet, premium frame that blends into your space.',
    Icon: HomeFrameIcon,
  },
]

const waitlistFormProps = {
  source: 'waitlist',
  page: '/waitlist',
  heading: 'Join the early access waitlist',
  intro: '',
  buttonText: 'Join early access',
  helperText: 'No payment. No spam. Just launch updates and early access.',
  successMessage: 'Thank you! You are now on the RE:MIND early access waitlist.',
  formClassName: 'mt-0',
}

export default function WaitlistPage() {
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
          <a href="/waitlist" className="text-[24px] font-medium tracking-[0.28em] text-black/90 md:text-[29px]">
            RE:MIND
          </a>
          <a
            href="#early-access"
            className="shop-button rounded-full bg-[#171512] px-4 py-2 text-[12px] font-medium tracking-[0.08em] text-white shadow-[0_10px_24px_rgba(0,0,0,0.12)]"
          >
            Join early access
          </a>
        </div>
      </header>

      <section className="px-5 pb-6 pt-5 md:px-10 md:pb-14 md:pt-12">
        <div className="mx-auto grid max-w-[1180px] gap-6 lg:grid-cols-[minmax(0,1.02fr)_minmax(360px,0.98fr)] lg:items-center lg:gap-12">
          <ShopReveal>
            <div className="flex flex-col gap-4 md:gap-6">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-black/45">Early access</p>
                <h1 className="mt-3 max-w-[690px] text-[30px] font-medium leading-[1.03] tracking-[-0.052em] text-[#15120f] sm:text-[46px] md:text-[60px]">
                  Family reminders, weather and calendar updates — all at a glance, without checking your phone.
                </h1>
                <p className="mt-4 max-w-[58ch] text-[16px] leading-[1.5] text-black/62 md:mt-5 md:text-[18px]">
                  A calm digital frame for the hallway, kitchen or living room. Built for families who want less screen time and more presence.
                </p>
              </div>

              <div
                id="early-access"
                className="rounded-[28px] border border-black/10 bg-[#fffdf9] p-4 shadow-[0_24px_70px_rgba(73,54,34,0.12)] sm:p-6 md:max-w-[430px]"
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
                  alt="RE:MIND frame displayed in a calm home setting"
                  fill
                  priority
                  sizes="(min-width: 1024px) 48vw, 100vw"
                  className="object-cover object-center"
                />
              </div>
              <div className="absolute bottom-4 left-4 right-4 rounded-[22px] border border-white/45 bg-white/75 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.10)] backdrop-blur md:bottom-6 md:left-6 md:right-auto md:max-w-[310px]">
                <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-black/45">Early access</p>
                <p className="mt-2 text-[15px] leading-[1.45] text-black/70">Reminders, weather and calendar updates — visible before everyone leaves home.</p>
              </div>
            </div>
          </ShopReveal>
        </div>
      </section>

      <section className="px-5 py-5 md:px-10 md:py-12" aria-labelledby="waitlist-benefits">
        <div className="mx-auto max-w-[1180px]">
          <h2 id="waitlist-benefits" className="sr-only">RE:MIND benefits</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {benefits.map(({ Icon, ...benefit }, index) => (
              <ShopReveal key={benefit.title} delayMs={index * 55}>
                <article className="shop-card h-full rounded-[26px] border border-black/10 bg-[#fffaf2] p-4 shadow-[0_16px_40px_rgba(73,54,34,0.08)] sm:p-5 md:p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#e7d8c4] text-[#5f5143]/75 md:mb-6" aria-hidden="true">
                    <Icon className="h-[22px] w-[22px]" />
                  </div>
                  <h3 className="text-[20px] font-medium tracking-[-0.02em] text-black/85">{benefit.title}</h3>
                  <p className="mt-2.5 max-w-[28ch] text-[15px] leading-[1.55] text-black/58 md:mt-3">{benefit.text}</p>
                </article>
              </ShopReveal>
            ))}
          </div>
        </div>
      </section>

    </main>
  )
}
