import type { Metadata } from 'next'
import { ShopFooter, ShopHeader } from '../ShopChrome'
import { ShopReveal } from '../ShopMotion'

export const metadata: Metadata = {
  title: 'About RE:MIND',
  description: 'The story behind RE:MIND, a calm digital frame for everyday family life.',
}

export default function AboutPage() {
  return (
    <main
      className="shop-page h-screen overflow-y-auto overflow-x-hidden bg-[#f6f3ed] text-[#171512]"
      style={{
        marginTop: 'calc(env(safe-area-inset-top) * -1)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="shop-shell mx-auto w-full max-w-[2560px] bg-[#f6f3ed] 2xl:max-w-[1720px]">
        <ShopHeader language="en" />

        <section className="mx-auto w-full max-w-[1200px] px-6 pb-16 pt-7 md:px-14 md:pb-24 md:pt-10" aria-labelledby="about-title">
          <a
            href="/shop"
            className="group inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-black/60 transition-colors hover:text-black focus-visible:text-black"
          >
            <span aria-hidden className="text-base leading-none transition-transform group-hover:-translate-x-0.5">←</span>
            Back to home
          </a>

          <ShopReveal className="mt-8 md:mt-12">
            <article className="overflow-hidden rounded-[30px] border border-black/10 bg-[#fffdf9] shadow-[0_24px_70px_rgba(73,54,34,0.10)]">
              <div className="grid lg:grid-cols-[minmax(240px,0.55fr)_minmax(0,1.45fr)]">
                <header className="bg-[#e9dfd1] p-7 sm:p-10 lg:p-12">
                  <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-black/45">From Stavanger</p>
                  <h1 id="about-title" className="mt-4 max-w-[8ch] text-[38px] font-medium leading-[1.02] tracking-[-0.045em] text-[#15120f] sm:text-[48px] lg:text-[56px]">
                    A little note
                  </h1>
                  <div className="mt-8 h-px w-16 bg-black/20" aria-hidden />
                  <p className="mt-5 text-sm leading-6 text-black/55">From Vetle,<br />founder of RE:MIND</p>
                </header>

                <div className="p-7 sm:p-10 lg:p-14">
                  <div className="max-w-[720px] space-y-5 text-[16px] leading-[1.75] text-black/66 md:text-[18px]">
                    <p className="text-[20px] leading-[1.55] text-black/82 md:text-[22px]">
                      Hi, I’m Vetle, founder of RE:MIND — a small project from Stavanger, Norway.
                    </p>

                    <p>
                      I first built RE:MIND so I could check the surf conditions on my way out the door. Before long, I realised there were more things I wanted to catch at a glance — without having to reach for my phone.
                    </p>

                    <p>
                      Will it rain today? Should I bring an umbrella? Are we running low on anything in the fridge? And, just as importantly: remember to put the bin out for collection.
                    </p>

                    <p>
                      Since then, RE:MIND has grown into a calm digital frame for families. It can display reminders, weather and calendars, and connect with services you already use.
                    </p>

                    <aside className="rounded-[24px] bg-[#f4ecdf] p-5 text-black/70 md:p-6">
                      <p className="font-medium text-[#171512]">The idea is simple:</p>
                      <p className="mt-2">
                        See what matters in everyday life, without the noise — whether Sander’s football practice has moved to 6:00 pm, or Mari needs to remember her swimwear for school tomorrow.
                      </p>
                    </aside>

                    <p>
                      If RE:MIND sounds useful and you’d like to follow the journey, I’d be grateful if you joined the waitlist. You’ll receive occasional updates on our progress and launch date, plus an introductory offer as a thank-you for being here early.
                    </p>
                  </div>

                  <a
                    href="/shop#waitlist"
                    className="shop-button mt-8 inline-flex items-center justify-center rounded-full bg-[#171512] px-6 py-3 text-sm font-medium text-white shadow-[0_12px_28px_rgba(0,0,0,0.13)]"
                  >
                    Join the waitlist
                  </a>
                </div>
              </div>
            </article>
          </ShopReveal>
        </section>

        <ShopFooter language="en" />
      </div>
    </main>
  )
}
