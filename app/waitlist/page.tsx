import Image from 'next/image'
import type { Metadata } from 'next'
import { ShopFadeImage, ShopReveal } from '../shop/ShopMotion'
import WaitlistForm from '../shop/WaitlistForm'

export const metadata: Metadata = {
  title: 'RE:MIND Early Access Waitlist',
  description: 'Join the RE:MIND early access waitlist for a calm digital frame with family reminders, weather, and calendar updates.',
}

const benefits = [
  {
    title: 'Family reminders',
    text: 'Keep everyday tasks visible where everyone sees them.',
  },
  {
    title: 'Weather and calendar',
    text: 'Know what matters before leaving the house.',
  },
  {
    title: 'Designed for the home',
    text: 'A quiet, premium frame that blends into your space.',
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
      className="shop-page min-h-screen overflow-x-hidden bg-[#f6f3ed] text-[#171512]"
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
            {benefits.map((benefit, index) => (
              <ShopReveal key={benefit.title} delayMs={index * 55}>
                <article className="shop-card h-full rounded-[26px] border border-black/10 bg-[#fffaf2] p-5 shadow-[0_16px_40px_rgba(73,54,34,0.08)] md:p-6">
                  <div className="mb-5 h-10 w-10 rounded-full bg-[#e7d8c4] md:mb-8" aria-hidden />
                  <h3 className="text-[20px] font-medium tracking-[-0.02em] text-black/85">{benefit.title}</h3>
                  <p className="mt-3 max-w-[28ch] text-[15px] leading-[1.55] text-black/58">{benefit.text}</p>
                </article>
              </ShopReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-8 md:px-10 md:py-14">
        <ShopReveal>
          <div className="mx-auto grid max-w-[1180px] overflow-hidden rounded-[32px] border border-black/10 bg-[#171512] text-white shadow-[0_24px_70px_rgba(0,0,0,0.18)] md:grid-cols-[0.95fr_1.05fr] md:items-center">
            <div className="p-7 md:p-10 lg:p-12">
              <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-white/45">Coming soon</p>
              <h2 className="mt-4 text-[34px] font-medium leading-[1.04] tracking-[-0.045em] md:text-[48px]">Currently in development</h2>
              <p className="mt-5 max-w-[52ch] text-[16px] leading-[1.65] text-white/68 md:text-[18px]">
                The first people on the waitlist will follow the development journey and get early access before launch.
              </p>
            </div>
            <div className="relative min-h-[260px] overflow-hidden border-t border-white/10 bg-[#d8c9b3] md:min-h-[420px] md:border-l md:border-t-0">
              <Image
                src="/shop/mattes-hero.png"
                alt="Warm RE:MIND material detail"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover opacity-90"
              />
              <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(23,21,18,0.34),transparent_55%)]" />
            </div>
          </div>
        </ShopReveal>
      </section>

      <section className="px-5 pb-14 pt-6 md:px-10 md:pb-20 md:pt-10">
        <ShopReveal>
          <div className="mx-auto max-w-[720px] rounded-[32px] border border-black/10 bg-[#fffdf9] p-6 text-center shadow-[0_24px_70px_rgba(73,54,34,0.11)] md:p-9">
            <h2 className="text-[32px] font-medium leading-[1.05] tracking-[-0.045em] md:text-[46px]">Join the early access waitlist</h2>
            <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-[1.55] text-black/55">
              Be first to hear when RE:MIND is ready for homes like yours.
            </p>
            <div className="mx-auto mt-6 max-w-[430px] text-left">
              <WaitlistForm {...waitlistFormProps} />
            </div>
          </div>
        </ShopReveal>
      </section>
    </main>
  )
}
