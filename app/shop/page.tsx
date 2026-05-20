import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Re-mind Shop',
  description: 'Official Re-mind storefront',
}

const frameFinishes = [
  { name: 'Midnight Black', tone: 'bg-[#1a1c1f]' },
  { name: 'Natural Oak', tone: 'bg-[#c8ae8b]' },
  { name: 'Walnut', tone: 'bg-[#6d4d3a]' },
  { name: 'Cloud White', tone: 'bg-[#f4f4f2] border border-black/5' },
]

const matteOptions = [
  { name: 'Warm White', tone: 'bg-[#f7f3ea] border border-black/5' },
  { name: 'Soft Grey', tone: 'bg-[#d7d8dc]' },
  { name: 'Deep Black', tone: 'bg-[#1f2124]' },
]

const accessories = [
  'Desk stand',
  'Wall mount',
  'Cleaning kit',
]

export default function ShopPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f8f6f2] text-[#1d1d1f]">
      <div className="mx-auto w-full max-w-6xl px-6 py-6 sm:px-10 sm:py-8">
        <header className="flex items-center justify-between">
          <span className="text-sm font-semibold tracking-[0.2em]">RE:MIND</span>
          <nav className="hidden items-center gap-8 text-sm text-black/70 md:flex">
            <a href="#frames">Frames</a><a href="#mattes">Mattes</a><a href="#accessories">Accessories</a><a href="#about">About</a>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login" className="rounded-full border border-black/15 px-4 py-1.5 font-medium">Open app</Link>
            <span className="hidden text-black/35 sm:inline">Cart —</span>
          </div>
        </header>

        <section className="grid gap-10 py-14 md:grid-cols-2 md:items-center">
          <div className="space-y-5">
            <p className="text-xs tracking-[0.24em] text-black/45">RE-MIND SHOP</p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">Frames that fit your life.</h1>
            <p className="max-w-lg text-lg text-black/60">A calm home display, made to change with your space.</p>
            <div className="flex flex-wrap gap-3">
              <a href="#frames" className="rounded-full bg-[#1d1d1f] px-5 py-2.5 text-sm font-medium text-white">Explore frames</a>
              <a href="#about" className="rounded-full border border-black/15 px-5 py-2.5 text-sm font-medium">See how it works</a>
            </div>
          </div>
          <div className="rounded-[2rem] bg-white p-7 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
            <div className="aspect-[4/3] rounded-[1.5rem] bg-gradient-to-br from-[#efede8] to-[#ded9d0] p-5">
              <div className="h-full rounded-[1.2rem] border border-black/5 bg-[#f7f6f3] p-4">
                <div className="h-full rounded-[1rem] bg-[radial-gradient(circle_at_30%_30%,#ffffff,transparent_45%),radial-gradient(circle_at_70%_70%,#d8d4cc,transparent_50%),#ece9e2]" />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-y border-black/10 py-8 text-sm text-black/70 sm:grid-cols-2 lg:grid-cols-4">
          <p>Swap in seconds</p><p>Premium materials</p><p>Built to last</p><p>Made for Re-mind</p>
        </section>

        <section id="frames" className="py-14">
          <h2 className="text-2xl font-semibold">Popular frames</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {frameFinishes.map((item) => (
              <article key={item.name} className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
                <div className={`aspect-[4/3] rounded-xl ${item.tone}`} />
                <h3 className="mt-3 text-sm font-medium">{item.name}</h3>
              </article>
            ))}
          </div>
        </section>

        <section id="mattes" className="py-10">
          <h2 className="text-2xl font-semibold">Change the feel. Not the frame.</h2>
          <p className="mt-2 max-w-2xl text-black/60">Swappable mattes let your frame adapt to seasons, rooms, and routines in seconds.</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {matteOptions.map((item) => (
              <article key={item.name} className="rounded-2xl border border-black/8 bg-white p-4">
                <div className={`aspect-[16/10] rounded-xl ${item.tone}`} />
                <h3 className="mt-3 text-sm font-medium">{item.name}</h3>
              </article>
            ))}
          </div>
        </section>

        <section id="accessories" className="py-10">
          <h2 className="text-2xl font-semibold">Accessories</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {accessories.map((item) => (
              <article key={item} className="rounded-2xl bg-white p-5">
                <p className="text-sm font-medium">{item}</p>
              </article>
            ))}
          </div>
        </section>

        <footer id="about" className="mt-8 border-t border-black/10 py-10">
          <p className="max-w-3xl text-lg leading-relaxed text-black/70">
            Less screen time. A final glance before leaving home. Calm information for your space.
          </p>
          <div className="mt-6 flex flex-wrap gap-5 text-sm text-black/50">
            <span>Privacy</span><span>Terms</span><span>Contact</span><span>Shipping</span>
          </div>
        </footer>
      </div>
    </main>
  )
}
