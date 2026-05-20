import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Re-mind Shop',
  description: 'Official Re-mind storefront',
}

type FrameCard = {
  name: string
  price: string
  subtitle: string
  palette: [string, string, string]
  swatches: string[]
}

const frameCards: FrameCard[] = [
  {
    name: 'Midnight Black',
    price: '€69',
    subtitle: 'Matte aluminum',
    palette: ['#111214', '#252628', '#3c3d40'],
    swatches: ['#111214', '#d5d5d5'],
  },
  {
    name: 'Walnut Wood',
    price: '€79',
    subtitle: 'Real walnut',
    palette: ['#5a3a2a', '#7a513c', '#946550'],
    swatches: ['#6a4633', '#bdb7b0', '#8a624a'],
  },
  {
    name: 'Natural Oak',
    price: '€79',
    subtitle: 'Real oak',
    palette: ['#b5824f', '#cb9b67', '#deb57e'],
    swatches: ['#bb8d5f', '#d8be9f'],
  },
  {
    name: 'Cloud White',
    price: '€69',
    subtitle: 'Matte aluminum',
    palette: ['#e8e7e3', '#f2f2ee', '#dbdad5'],
    swatches: ['#f0f0ef', '#cfcfcf'],
  },
]

const accessories = [
  { name: 'Desk Stand', price: '€39' },
  { name: 'Wall Mount', price: '€29' },
  { name: 'Cleaning Kit', price: '€19' },
  { name: 'Gift Box', price: '€9' },
]

function CornerCrop({ palette }: { palette: [string, string, string] }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-[#e9e7e3]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_24%,rgba(255,255,255,0.7),transparent_55%)]" />
      <div
        className="absolute left-8 top-8 h-40 w-40 rotate-[-18deg] border-[14px]"
        style={{ borderColor: palette[0], boxShadow: `0 0 0 1px ${palette[1]} inset, 0 14px 24px rgba(0,0,0,0.18)` }}
      >
        <div
          className="h-full w-full"
          style={{ background: `linear-gradient(145deg, ${palette[1]}, ${palette[2]})` }}
        />
      </div>
    </div>
  )
}

export default function ShopPage() {
  return (
    <main
      className="h-screen overflow-y-auto overflow-x-hidden bg-[#f5f4f2] text-[#141414]"
      style={{
        marginTop: 'calc(env(safe-area-inset-top) * -1)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="bg-[#0b0d10] text-[11px] text-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-8 px-6 py-2 tracking-[0.02em] sm:gap-14">
          <span>Free shipping over €100</span><span>30 day returns</span><span>2 year warranty</span>
        </div>
      </div>

      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-6">
          <span className="text-[34px] font-medium tracking-[0.32em]">RE:MIND</span>
          <nav className="hidden items-center gap-10 text-sm uppercase tracking-[0.09em] md:flex">
            <a href="#frames" className="border-b-2 border-black pb-1">Frames</a>
            <a href="#mattes" className="pb-1">Mattes</a>
            <a href="#accessories" className="pb-1">Accessories</a>
            <a href="#bundles" className="pb-1">Bundles</a>
            <a href="#about" className="pb-1">About</a>
          </nav>
          <div className="flex items-center gap-4 text-lg text-black/75"><span>◌</span><span>🛒</span></div>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-6 pb-12">
        <section className="grid gap-8 border-b border-black/10 py-10 md:grid-cols-[0.95fr_1.25fr] md:items-stretch">
          <div className="flex flex-col justify-center">
            <h1 className="text-[54px] font-medium leading-[1.03] tracking-[-0.03em]">Frames that fit your life.</h1>
            <p className="mt-6 max-w-md text-[28px] leading-8 text-black/65">Swap in seconds. Designed to complement your home, your style, your day.</p>
            <button className="mt-8 w-fit rounded bg-black px-8 py-3 text-sm font-medium tracking-wide text-white">SHOP FRAMES</button>
            <div className="mt-7 text-sm">
              <p className="font-medium">Swap in seconds</p>
              <p className="text-black/60">Satisfying click. Designed for ease.</p>
            </div>
          </div>
          <div className="relative min-h-[420px] overflow-hidden rounded-sm border border-black/10 bg-[linear-gradient(170deg,#f2efeb_0%,#ece8e2_45%,#ddd4c9_100%)]">
            <div className="absolute bottom-0 left-0 right-0 h-28 bg-[linear-gradient(180deg,#7e573a,#5a3d2c)]" />
            <div className="absolute right-6 top-10 h-60 w-20 rounded-t-full bg-[#e3e1db]" />
            <div className="absolute bottom-24 left-10 flex gap-2">
              {['#ae7a54', '#704d39', '#5a5a5a', '#f0efea'].map((tone) => (
                <span key={tone} className="h-56 w-9 rotate-[8deg] rounded-sm shadow" style={{ backgroundColor: tone }} />
              ))}
            </div>
            <div className="absolute bottom-20 right-8 w-[340px] rotate-[-4deg] rounded-md border-[14px] border-[#1b1d1f] bg-[#111] p-4 shadow-2xl">
              <div className="rounded-sm bg-[linear-gradient(180deg,#2c2f31,#121416)] p-4 text-center text-white/80">
                <p className="text-sm">Monday, 18. May</p><p className="mt-3 h-28 rounded-sm bg-black/45" />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-b border-black/10 py-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {['Swap in seconds', 'Premium materials', 'Built to last', 'Made for Re:mind'].map((item) => (
            <article key={item} className="flex gap-3"><span>◌</span><div><p className="font-medium uppercase tracking-[0.08em]">{item}</p><p className="text-black/60">Satisfying click. Designed for ease.</p></div></article>
          ))}
        </section>

        <section id="frames" className="py-10">
          <div className="mb-5 flex items-center justify-between"><h2 className="text-3xl font-semibold uppercase tracking-[0.06em]">Popular Frames</h2><a className="text-sm uppercase tracking-[0.08em]" href="#">View all frames →</a></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {frameCards.map((card) => (
              <article key={card.name} className="border border-black/10 bg-white p-3">
                <CornerCrop palette={card.palette} />
                <div className="mt-3 flex items-start justify-between text-lg"><h3>{card.name}</h3><span>{card.price}</span></div>
                <p className="text-sm text-black/60">{card.subtitle}</p>
                <div className="mt-3 flex gap-2">{card.swatches.map((swatch) => <span key={swatch} className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ backgroundColor: swatch }} />)}</div>
              </article>
            ))}
          </div>
        </section>

        <section id="mattes" className="grid gap-4 border border-black/10 bg-[#ebe7e1] p-8 md:grid-cols-[0.75fr_1.25fr] md:items-center">
          <div><p className="text-sm uppercase tracking-[0.09em]">Mattes</p><h2 className="mt-3 text-5xl leading-[1.06] tracking-[-0.02em]">Change the feel.<br />Not the frame.</h2><button className="mt-6 rounded bg-black px-7 py-3 text-sm text-white">SHOP MATTES</button></div>
          <div className="relative h-[260px] overflow-hidden rounded-sm bg-[#f5f2ee]">
            <div className="absolute left-12 top-16 h-44 w-60 rotate-[18deg] border-[14px] border-[#1f2124]" />
            <div className="absolute left-40 top-8 h-44 w-64 rotate-[16deg] border-[14px] border-[#fbfaf7]" />
            <div className="absolute left-52 top-20 h-36 w-44 rotate-[18deg] border-[12px] border-[#ece8e0]" />
          </div>
        </section>

        <section id="accessories" className="py-10">
          <div className="mb-5 flex items-center justify-between"><h2 className="text-3xl font-semibold uppercase tracking-[0.06em]">Complete the experience</h2><a className="text-sm uppercase tracking-[0.08em]" href="#">View all accessories →</a></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {accessories.map((item) => (
              <article key={item.name} className="border border-black/10 bg-white p-3">
                <div className="flex aspect-[16/9] items-center justify-center bg-[#ece9e4] text-5xl">▣</div>
                <div className="mt-3 flex justify-between"><h3>{item.name}</h3><span>{item.price}</span></div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <footer id="about" className="border-t border-black/10 bg-[#f1f0ee]">
        <div className="mx-auto grid max-w-[1200px] gap-5 border-b border-black/10 px-6 py-5 text-sm sm:grid-cols-3">
          <p>FREE SHIPPING<br /><span className="text-black/60">On orders over €100</span></p>
          <p>30 DAY RETURNS<br /><span className="text-black/60">No questions asked</span></p>
          <p>2 YEAR WARRANTY<br /><span className="text-black/60">Peace of mind</span></p>
        </div>
        <div className="mx-auto grid max-w-[1200px] gap-8 px-6 py-9 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div><p className="mb-3 tracking-[0.2em]">RE:MIND</p><p className="text-black/65">Re-mind gives you what matters, beautifully displayed.</p></div>
          <div><p className="mb-2 font-medium">SHOP</p><p>Frames</p><p>Mattes</p><p>Accessories</p><p>Bundles</p></div>
          <div><p className="mb-2 font-medium">SUPPORT</p><p>FAQ</p><p>Shipping</p><p>Returns</p><p>Warranty</p></div>
          <div><p className="mb-2 font-medium">COMPANY</p><p>About</p><p>Sustainability</p><p>Contact</p><p>Press</p></div>
          <div><p className="mb-2 font-medium">STAY IN THE LOOP</p><div className="mt-2 flex overflow-hidden rounded border border-black/15"><input className="w-full bg-white px-3 py-2 outline-none" placeholder="Your email" /><button className="bg-black px-3 text-white">→</button></div></div>
        </div>
      </footer>
    </main>
  )
}
