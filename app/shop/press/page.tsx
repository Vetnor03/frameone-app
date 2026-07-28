import Image from 'next/image'
import type { Metadata } from 'next'
import CompanyPageShell from '../CompanyPageShell'
import { shopMetadata } from '../seo'

export const metadata: Metadata = shopMetadata({
  title: 'Press | RE:MIND',
  description: 'RE:MIND company facts, logo and product imagery for press and media.',
  path: '/shop/press',
})

const pressImages = [
  { src: '/shop/remind-device-v2.png', alt: 'RE:MIND digital frame product view', label: 'RE:MIND device' },
  { src: '/shop/products/frames/Oak.png', alt: 'RE:MIND frame in natural oak', label: 'Natural oak frame' },
  { src: '/shop/products/device/Dark.png', alt: 'RE:MIND device in its dark finish', label: 'Dark device' },
]

export default function PressPage() {
  return (
    <CompanyPageShell
      eyebrow="Press room"
      title="Meet RE:MIND."
      intro="A calm digital frame from Stavanger, Norway—created to put useful information in view and help people spend less time reaching for their phones."
    >
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <article className="rounded-[30px] bg-[#171b19] p-7 text-white sm:p-10 md:p-12">
          <p className="text-xs uppercase tracking-[0.2em] text-white/45">In short</p>
          <p className="mt-8 text-xl leading-8 text-white/85">
            RE:MIND brings reminders, weather, calendars and updates from the services people already use into one considered home display.
          </p>
          <dl className="mt-10 divide-y divide-white/12 text-sm">
            <div className="flex justify-between gap-6 py-4"><dt className="text-white/45">Founded</dt><dd>Stavanger, Norway</dd></div>
            <div className="flex justify-between gap-6 py-4"><dt className="text-white/45">Founder</dt><dd>Vetle Norstad</dd></div>
            <div className="flex justify-between gap-6 py-4"><dt className="text-white/45">Category</dt><dd>Calm technology</dd></div>
          </dl>
          <a href="mailto:support@re-mind.no?subject=Press%20enquiry" className="mt-9 inline-flex rounded-full bg-white px-6 py-3 text-sm font-medium text-black">
            Contact press team
          </a>
        </article>

        <figure className="relative min-h-[440px] overflow-hidden rounded-[30px] bg-[#e5ded2] lg:min-h-full">
          <Image src="/shop/hero-top.jpg" alt="RE:MIND frame styled in a home" fill priority sizes="(max-width: 1024px) 100vw, 650px" className="object-cover" />
        </figure>
      </div>

      <section className="mt-16" aria-labelledby="press-assets-title">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-black/40">Media assets</p>
            <h2 id="press-assets-title" className="mt-3 text-3xl font-medium tracking-[-0.035em] sm:text-4xl">Logo &amp; product pictures</h2>
          </div>
          <p className="max-w-[390px] text-sm leading-6 text-black/55">Use these images when writing about RE:MIND. Please keep the logo clear and do not alter its proportions.</p>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <a href="/r_Logo.png" className="shop-card group rounded-[26px] border border-black/10 bg-white p-5" download>
            <div className="flex aspect-[1.55] items-center justify-center rounded-[18px] bg-[#e9dfd1] p-12">
              <Image src="/r_Logo.png" alt="R: logo" width={856} height={856} className="h-28 w-28 object-contain sm:h-32 sm:w-32" />
            </div>
            <div className="flex items-center justify-between gap-4 px-1 pb-1 pt-5"><p className="font-medium">R: logo</p><span className="text-xs uppercase tracking-[0.14em] text-black/45">Download ↓</span></div>
          </a>
          {pressImages.map((asset) => (
            <a key={asset.src} href={asset.src} className="shop-card group rounded-[26px] border border-black/10 bg-white p-5" download>
              <div className="relative aspect-[1.55] overflow-hidden rounded-[18px] bg-[#f0ede7]">
                <Image src={asset.src} alt={asset.alt} fill sizes="(max-width: 640px) 100vw, 520px" className="object-contain p-5 transition-transform duration-500 group-hover:scale-[1.025]" />
              </div>
              <div className="flex items-center justify-between gap-4 px-1 pb-1 pt-5"><p className="font-medium">{asset.label}</p><span className="text-xs uppercase tracking-[0.14em] text-black/45">Download ↓</span></div>
            </a>
          ))}
        </div>
      </section>
    </CompanyPageShell>
  )
}
