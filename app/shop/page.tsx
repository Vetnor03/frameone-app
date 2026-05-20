import type { Metadata } from 'next'
import Link from 'next/link'
import ShopNav from './ShopNav'

export const metadata: Metadata = {
  title: 'Re-mind Shop',
  description: 'Official Re-mind storefront',
}

type FrameFinish = {
  name: string
  description: string
  frameTone: string
  matTone: string
  artTone: string
}

const frameFinishes: FrameFinish[] = [
  {
    name: 'Midnight Black',
    description: 'A quiet contrast for bright walls and architectural interiors.',
    frameTone: '#1b1c1f',
    matTone: '#f4f1ea',
    artTone: '#d8d4cb',
  },
  {
    name: 'Natural Oak',
    description: 'Soft grain warmth with a gallery-like balance in daylight.',
    frameTone: '#c8ae8b',
    matTone: '#f6f2e9',
    artTone: '#d4cec3',
  },
  {
    name: 'Walnut',
    description: 'A deeper wood expression with understated richness.',
    frameTone: '#6d4d3a',
    matTone: '#f7f4ec',
    artTone: '#d9d1c4',
  },
  {
    name: 'Cloud White',
    description: 'A tonal frame that disappears into minimal, calm spaces.',
    frameTone: '#ece8e0',
    matTone: '#f9f7f2',
    artTone: '#d8d5ce',
  },
]

const matteOptions = [
  { name: 'Warm White', tone: 'bg-[#f7f3ea] border border-black/5' },
  { name: 'Soft Grey', tone: 'bg-[#d7d8dc]' },
  { name: 'Deep Black', tone: 'bg-[#1f2124]' },
]

const accessories = ['Desk stand', 'Wall mount', 'Cleaning kit']

function FrameVisual({ frameTone, matTone, artTone }: Omit<FrameFinish, 'name' | 'description'>) {
  return (
    <div className="relative mx-auto w-full max-w-[460px]">
      <div className="absolute -inset-4 rounded-[2.25rem] bg-[radial-gradient(circle_at_45%_35%,rgba(255,255,255,0.6),transparent_62%)] opacity-80" />
      <div className="relative rounded-[1.65rem] p-3 shadow-[0_24px_52px_rgba(0,0,0,0.2),0_2px_4px_rgba(0,0,0,0.08)]" style={{ backgroundColor: frameTone }}>
        <div className="rounded-[1.28rem] border border-white/30 bg-black/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-8px_14px_rgba(0,0,0,0.16)]">
          <div className="rounded-[1rem] border border-black/8 p-4" style={{ backgroundColor: matTone }}>
            <div
              className="aspect-[4/3] rounded-[0.75rem]"
              style={{
                background: `radial-gradient(circle at 25% 22%, rgba(255,255,255,0.78), transparent 44%), radial-gradient(circle at 70% 80%, rgba(0,0,0,0.12), transparent 52%), linear-gradient(160deg, ${artTone}, #efebe3 52%, #cbc5b9)`,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -10px 14px rgba(0,0,0,0.1)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ShopPage() {
  return (
    <main
      className="min-h-screen overflow-y-auto overflow-x-hidden bg-[#f6f3ed] text-[#1c1b1a]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-10 sm:py-10 lg:py-12">
        <header className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShopNav />
            <span className="text-sm font-semibold tracking-[0.2em]">RE:MIND</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login?next=/?nosplash=1" className="rounded-full border border-black/15 px-4 py-1.5 font-medium">Open app</Link>
          </div>
        </header>

        <section className="grid gap-12 py-16 md:grid-cols-[1fr_1.18fr] md:items-center md:gap-10 md:py-24 lg:gap-16 lg:py-28">
          <div className="space-y-7">
            <p className="text-xs tracking-[0.28em] text-black/45">RE-MIND SHOP</p>
            <h1 className="max-w-xl text-[2.45rem] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[3.5rem] lg:text-[4rem]">
              Frames that belong in your home.
            </h1>
            <p className="max-w-lg text-[1.04rem] leading-relaxed text-black/63 sm:text-lg">
              Designed as quiet objects first. Crafted to hold everyday information with the same composure as a
              gallery frame.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <a href="#frames" className="rounded-full bg-[#1d1d1f] px-5 py-2.5 text-sm font-medium text-white">
                Explore frames
              </a>
              <a href="#about" className="rounded-full border border-black/15 px-5 py-2.5 text-sm font-medium">
                See how it works
              </a>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-5 rounded-[2.4rem] border border-black/5 bg-[#faf8f3]/65" />
            <div className="relative rounded-[2.2rem] border border-black/10 bg-[#f1ede4] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.1)] sm:p-7">
              <FrameVisual frameTone="#241f1d" matTone="#f7f4ee" artTone="#d9d4ca" />
            </div>
          </div>
        </section>

        <section className="grid gap-5 border-y border-black/10 py-10 text-sm tracking-[0.02em] text-black/70 sm:grid-cols-2 lg:grid-cols-4">
          <p>Swap in seconds</p>
          <p>Premium materials</p>
          <p>Built to last</p>
          <p>Made for Re-mind</p>
        </section>

        <section id="frames" className="py-16 sm:py-20">
          <h2 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.01em]">Popular frames</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {frameFinishes.map((item) => (
              <article
                key={item.name}
                className="group rounded-3xl border border-black/8 bg-[#fcfbf8] p-4 shadow-[0_10px_24px_rgba(0,0,0,0.06)] transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(0,0,0,0.09)]"
              >
                <FrameVisual frameTone={item.frameTone} matTone={item.matTone} artTone={item.artTone} />
                <h3 className="mt-4 text-base font-medium tracking-[-0.01em]">{item.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-black/58">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="mattes" className="py-12 sm:py-14">
          <h2 className="text-[1.82rem] font-semibold leading-tight tracking-[-0.01em]">Change the feel. Not the frame.</h2>
          <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-black/60">
            Swappable mattes let your frame adapt to seasons, rooms, and routines in seconds.
          </p>
          <div className="mt-7 grid gap-5 sm:grid-cols-3">
            {matteOptions.map((item) => (
              <article key={item.name} className="rounded-2xl border border-black/8 bg-white p-4 shadow-[0_8px_18px_rgba(0,0,0,0.04)]">
                <div className={`aspect-[16/10] rounded-xl ${item.tone}`} />
                <h3 className="mt-3 text-sm font-medium">{item.name}</h3>
              </article>
            ))}
          </div>
        </section>

        <section id="accessories" className="py-12 sm:py-14">
          <h2 className="text-[1.82rem] font-semibold leading-tight tracking-[-0.01em]">Accessories</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {accessories.map((item) => (
              <article key={item} className="rounded-2xl border border-black/6 bg-white p-5 shadow-[0_8px_18px_rgba(0,0,0,0.04)]">
                <p className="text-sm font-medium">{item}</p>
              </article>
            ))}
          </div>
        </section>

        <footer id="about" className="mt-10 border-t border-black/10 py-12 sm:py-14">
          <p className="max-w-3xl text-[1.2rem] leading-relaxed text-black/72 sm:text-[1.28rem]">
            Less screen time. A final glance before leaving home. Calm information for your space.
          </p>
          <div className="mt-7 flex flex-wrap gap-5 text-sm text-black/50">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Contact</span>
            <span>Shipping</span>
          </div>
        </footer>
      </div>
    </main>
  )
}
