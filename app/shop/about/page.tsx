import type { Metadata } from 'next'
import Image from 'next/image'
import { ShopFooter, ShopHeader } from '../ShopChrome'
import { ShopReveal } from '../ShopMotion'
import { shopMetadata } from '../seo'

export const metadata: Metadata = shopMetadata({
  title: 'About | RE:MIND',
  description: 'The story behind RE:MIND, a calm digital frame that keeps an eye on what matters to you.',
  path: '/shop/about',
})

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
                  <div className="mt-8 h-px w-full bg-black/15" aria-hidden />
                  <div className="mt-7 flex items-center gap-4">
                    <div className="relative size-[68px] shrink-0 overflow-hidden rounded-full" aria-hidden>
                      <Image
                        src="/shop/headshot.jpg"
                        alt=""
                        fill
                        sizes="68px"
                        className="scale-[1.4] object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[17px] leading-tight text-[#241e18]">From Vetle</p>
                      <p className="mt-2 text-[9px] font-medium uppercase leading-tight tracking-[0.08em] text-[#a77c4f]">
                        Founder of RE:MIND
                      </p>
                    </div>
                  </div>
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
                      Will it rain today? Should I bring an umbrella? What’s happening nearby this weekend? And, just as importantly: remember which bin to put out for collection.
                    </p>

                    <p>
                      Since then, RE:MIND has grown into a calm digital frame for everyday life. It can display reminders, weather and calendars, connect with services you already use, and bring the information you care about into view.
                    </p>

                    <aside className="rounded-[24px] bg-[#f4ecdf] p-5 text-black/70 md:p-6">
                      <p className="font-medium text-[#171512]">Ask RE:MIND to keep an eye on anything.</p>
                      <p className="mt-2">
                        AI Follow can follow what matters to you and let you know when something changes.
                      </p>
                      <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-black/45">
                        30-day free trial · then subscription
                      </p>
                    </aside>

                    <p>
                      Notify me when this product is back in stock. Tell me when Coldplay announces a concert in Norway. Let me know if the surf forecast for Saturday improves, or when a flight I’m watching drops below my budget.
                    </p>

                    <p>
                      You choose what deserves your attention. RE:MIND quietly does the looking, then puts the update where you can see it — without another feed to scroll through.
                    </p>
                  </div>
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
