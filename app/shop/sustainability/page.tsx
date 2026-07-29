import Image from 'next/image'
import type { Metadata } from 'next'
import CompanyPageShell from '../CompanyPageShell'
import { ShopReveal } from '../ShopMotion'
import { shopMetadata } from '../seo'
import { pickShopLocale } from '../productData'

export const metadata: Metadata = shopMetadata({
  title: 'Sustainability | RE:MIND',
  description: 'How RE:MIND approaches thoughtful design, durable materials and a longer product life.',
  path: '/shop/sustainability',
})

const principles = [
  {
    number: '01',
    title: 'Made to stay',
    text: 'We design RE:MIND as a lasting part of the home, not another short-lived screen. A timeless shape and replaceable outer details let the frame evolve with your space.',
  },
  {
    number: '02',
    title: 'Less, chosen well',
    text: 'Every material and component should earn its place. We aim for considered construction, reduced packaging and materials that balance quality with a lighter footprint.',
  },
  {
    number: '03',
    title: 'Useful by design',
    text: 'The most sustainable product is one that keeps being useful. Software updates can add value over time, while interchangeable frames and mattes refresh the look without replacing the device. RE:MIND is designed to stay in use. If an aging battery eventually needs replacing, our goal is to make replacing the battery a simple and affordable alternative to replacing the entire product.',
  },
]

export default async function SustainabilityPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const language = pickShopLocale((await searchParams)?.lang)
  return (
    <CompanyPageShell
      language={language}
      eyebrow="Our approach"
      title="Designed for a longer life."
      intro="We are at the beginning of our journey, but our direction is clear: make fewer, better products that remain useful and feel at home for years."
    >
      <ShopReveal>
        <div className="relative min-h-[390px] overflow-hidden rounded-[30px] bg-[#ded9cc] md:min-h-[560px]">
          <Image
            src="/shop/hero-top.jpg"
            alt="RE:MIND displayed naturally in a calm home interior"
            fill
            priority
            sizes="(max-width: 1200px) 100vw, 1088px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
          <p className="absolute bottom-7 left-7 max-w-[25ch] text-sm leading-6 text-white/90 md:bottom-10 md:left-10 md:text-base">
            Calm technology should live well with what you already own.
          </p>
        </div>
      </ShopReveal>

      <div className="mt-8 grid overflow-hidden rounded-[30px] border border-black/10 bg-[#fffdf9] md:grid-cols-3">
        {principles.map((principle) => (
          <article key={principle.number} className="border-b border-black/10 p-7 last:border-b-0 md:border-b-0 md:border-r md:p-9 md:last:border-r-0">
            <p className="text-xs tracking-[0.18em] text-black/35">{principle.number}</p>
            <h2 className="mt-8 text-2xl font-medium tracking-[-0.03em]">{principle.title}</h2>
            <p className="mt-4 text-[15px] leading-7 text-black/62">{principle.text}</p>
          </article>
        ))}
      </div>

      <aside className="mt-8 rounded-[30px] bg-[#23352d] px-7 py-10 text-[#f8f5ee] sm:px-10 md:flex md:items-center md:justify-between md:gap-12 md:px-14 md:py-14">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">Keep us accountable</p>
          <h2 className="mt-3 text-3xl font-medium tracking-[-0.035em]">Progress over promises.</h2>
        </div>
        <p className="mt-5 max-w-[500px] text-[15px] leading-7 text-white/68 md:mt-0">
          We will keep learning and share clearer information as our production grows. Have a question about materials, packaging or product life? We would like to hear it.
        </p>
      </aside>
    </CompanyPageShell>
  )
}
