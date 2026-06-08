import Image from 'next/image'
import type { Metadata } from 'next'
import { ShopFadeImage, ShopMobileMenu, ShopReveal } from './ShopMotion'
import ShopLocaleCurrencySelector from './ShopLocaleCurrencySelector'
import WaitlistForm from './WaitlistForm'

export const metadata: Metadata = {
  title: 'RE:MIND Shop',
  description: 'Join the RE:MIND waitlist for launch updates and early-bird access.',
}

type Currency = 'EUR' | 'USD' | 'NOK'

type FrameCard = {
  name: string
  priceNok: number
  subtitle: string
  palette: [string, string, string]
  swatches: string[]
  imageSrc?: string
}

type AccessoryCard = {
  name: string
  priceNok: number
  imageSrc?: string
}

const frameCards: FrameCard[] = [
  {
    name: 'Black frame',
    priceNok: 349,
    subtitle: 'Ekstra ramme i matt sort aluminium',
    palette: ['#111214', '#252628', '#3c3d40'],
    swatches: ['#111214', '#d5d5d5'],
    imageSrc: '/shop/frames/midnight-black.png',
  },
  {
    name: 'White frame',
    priceNok: 349,
    subtitle: 'Ekstra ramme i matt hvit aluminium',
    palette: ['#e8e7e3', '#f2f2ee', '#dbdad5'],
    swatches: ['#f0f0ef', '#cfcfcf'],
    imageSrc: '/shop/frames/cloud-white.png',
  },
  {
    name: 'Oak frame',
    priceNok: 399,
    subtitle: 'Ekstra ramme i ekte eik',
    palette: ['#b5824f', '#cb9b67', '#deb57e'],
    swatches: ['#bb8d5f', '#d8be9f'],
    imageSrc: '/shop/frames/natural-oak.png',
  },
  {
    name: 'Walnut frame',
    priceNok: 399,
    subtitle: 'Ekstra ramme i ekte valnøtt',
    palette: ['#5a3a2a', '#7a513c', '#946550'],
    swatches: ['#6a4633', '#8a624a'],
    imageSrc: '/shop/frames/walnut-wood.png',
  },
]

const accessories: AccessoryCard[] = [
  { name: 'Premium matte', priceNok: 149, imageSrc: '/shop/accessories/wall-mount.png' },
  { name: 'Cleaning kit', priceNok: 79, imageSrc: '/shop/accessories/cleaning-kit.png' },
  { name: 'Replacement glass', priceNok: 99, imageSrc: '/shop/accessories/replacement-glass.png' },
  { name: 'Desk stand', priceNok: 199, imageSrc: '/shop/accessories/desk-stand.png' },
]

const socialLinks = [
  { name: 'Instagram', href: '#', iconSrc: '/shop/icons/social/instagram.png', iconWidth: 1024, iconHeight: 1024 },
  { name: 'Facebook', href: '#', iconSrc: '/shop/icons/social/facebook.png', iconWidth: 1024, iconHeight: 1024 },
  { name: 'Pinterest', href: '#', iconSrc: '/shop/icons/social/pinterest.png', iconWidth: 1536, iconHeight: 1024 },
] as const

const FX_FROM_NOK: Record<Currency, number> = { EUR: 0.086, USD: 0.1, NOK: 1 }
const CURRENCY_PREFIX: Record<Exclude<Currency, 'NOK'>, string> = { EUR: '€', USD: '$' }

function CornerCrop({ palette }: { palette: [string, string, string] }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-[#faf9f7]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_24%,rgba(255,255,255,0.7),transparent_55%)]" />
      <div
        className="absolute left-8 top-8 h-40 w-40 rotate-[-18deg] border-[14px]"
        style={{ borderColor: palette[0], boxShadow: `0 0 0 1px ${palette[1]} inset, 0 12px 22px rgba(0,0,0,0.12)` }}
      >
        <div className="h-full w-full" style={{ background: `linear-gradient(145deg, ${palette[1]}, ${palette[2]})` }} />
      </div>
    </div>
  )
}

function pickLang(v?: string): 'en' | 'no' {
  return v === 'en' ? 'en' : 'no'
}

function pickCurrency(v?: string): Currency {
  return v === 'EUR' || v === 'USD' ? v : 'NOK'
}

function formatPrice(valueNok: number, currency: Currency) {
  if (currency === 'NOK') {
    return `${valueNok.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} NOK`
  }

  const converted = Math.round(valueNok * FX_FROM_NOK[currency])
  return `${CURRENCY_PREFIX[currency]}${converted}`
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string; currency?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const language = pickLang(resolvedSearchParams?.lang)
  const currency = pickCurrency(resolvedSearchParams?.currency)
  const frameCardsLocalized = frameCards.map((item) => ({ ...item, price: formatPrice(item.priceNok, currency) }))
  const accessoriesLocalized = accessories.map((item) => ({ ...item, price: formatPrice(item.priceNok, currency) }))
  const devicePrice = formatPrice(1990, currency)
  const bundlePrice = formatPrice(2290, currency)
  const topShipping = formatPrice(1000, currency)
  const footerBenefits = [
    {
      title: language === 'no' ? 'VENTELISTE ÅPEN' : 'WAITLIST OPEN',
      body: language === 'no' ? 'Lanseres høsten 2026' : 'Launching autumn 2026',
      iconSrc: '/shop/icons/footer/free-shipping.png',
      iconAlt: 'Delivery truck icon',
    },
    {
      title: language === 'no' ? 'EARLY-BIRD TILGANG' : 'EARLY-BIRD ACCESS',
      body: language === 'no' ? 'Første oppdateringer' : 'First updates',
      iconSrc: '/shop/icons/footer/returns-30-day.png',
      iconAlt: 'Circular arrows return icon',
    },
    {
      title: language === 'no' ? '2 ÅRS GARANTI PLANLAGT' : '2 YEAR WARRANTY PLANNED',
      body: language === 'no' ? 'Trygghet ved lansering' : 'Peace of mind at launch',
      iconSrc: '/shop/icons/footer/warranty-2-year.png',
      iconAlt: 'Shield warranty icon',
    },
  ]

  return (
    <main
      className="shop-page h-screen overflow-y-auto overflow-x-hidden bg-white text-[#141414]"
      style={{
        marginTop: 'calc(env(safe-area-inset-top) * -1)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="shop-shell mx-auto w-full max-w-[2560px] bg-white 2xl:max-w-[1720px]">
        <div className="bg-[#0b0d10] text-[11px] text-white">
          <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-3 px-6 py-2 tracking-[0.02em] sm:gap-5">
            <span>{language === 'no' ? 'Lanseres høsten 2026' : 'Launching autumn 2026'}</span>
            <span className="h-3 w-px bg-white/35" aria-hidden />
            <span>{language === 'no' ? `Forventet pris fra ${devicePrice}` : `Expected price from ${devicePrice}`}</span>
            <span className="hidden h-3 w-px bg-white/35 sm:block" aria-hidden />
            <span className="hidden sm:inline">{language === 'no' ? `Gratis frakt planlagt over ${topShipping}` : `Free shipping planned over ${topShipping}`}</span>
          </div>
        </div>

        <header className="border-b border-black/10 bg-[#faf9f7]">
          <div className="mx-auto max-w-[1200px] px-6 py-6 md:px-14">
            <div className="flex items-center justify-between">
              <a href="/shop" className="text-[29px] font-medium tracking-[0.28em]">RE:MIND</a>
              <nav className="shop-nav hidden items-center gap-10 text-sm uppercase tracking-[0.09em] md:flex">
                <a href="#device" className="border-b-2 border-black pb-1">Enheten</a>
                <a href="#frames" className="pb-1">Ekstra rammer</a>
                <a href="#accessories" className="pb-1">Tilbehør</a>
                <a href="#bundles" className="pb-1">Startpakke</a>
                <a href="#waitlist" className="pb-1">Venteliste</a>
              </nav>
              <a href="#waitlist" className="shop-button hidden rounded bg-black px-5 py-2.5 text-xs font-medium uppercase tracking-[0.08em] text-white sm:inline-flex">
                Reserver din
              </a>
            </div>
            <div className="pt-4 md:hidden">
              <ShopMobileMenu>
                <nav className="shop-nav flex flex-col items-start gap-3 text-left text-sm uppercase tracking-[0.09em]">
                  <a href="#device" className="pb-1">Enheten</a>
                  <a href="#frames" className="pb-1">Ekstra rammer</a>
                  <a href="#accessories" className="pb-1">Tilbehør</a>
                  <a href="#bundles" className="pb-1">Startpakke</a>
                  <a href="#waitlist" className="pb-1">Venteliste</a>
                </nav>
              </ShopMobileMenu>
            </div>
          </div>
        </header>

        <div className="bg-[#faf9f7]">
          <div className="mx-auto max-w-[1200px]">
            <section className="relative py-10 md:min-h-[585px] md:py-0">
              <div className="relative z-10 mx-auto flex max-w-[26rem] flex-col px-6 py-3 md:-mt-6 md:min-h-[585px] md:max-w-none md:justify-center md:py-8 md:pl-14 md:pr-10">
                <p className="mb-3 text-sm font-medium uppercase tracking-[0.16em] text-black/55">RE:MIND</p>
                <h1 className="max-w-[12.4ch] text-[38px] font-medium leading-[1.04] tracking-[-0.03em] sm:text-[48px] md:text-[56px]">
                  <span className="block">Mindre skjermtid.</span>
                  <span className="block">Mer tilstedeværelse.</span>
                </h1>
                <p className="mt-5 max-w-[27ch] text-[17px] leading-[1.45] text-black/65 md:mt-6 md:max-w-[31ch] md:text-[18px]">
                  Smart e-paper display for det som betyr noe i hverdagen.
                </p>
                <p className="mt-5 max-w-[28ch] text-sm font-medium leading-[1.55] text-black/75">
                  Lanseres høsten 2026.
                  <br />
                  Forventet pris fra {devicePrice}.
                </p>
                <a href="#waitlist" className="shop-button mt-8 w-fit rounded bg-black px-8 py-3 text-sm font-medium tracking-wide text-white md:mt-9">
                  Bli med på ventelisten
                </a>
                <div className="mt-8 hidden items-start gap-3 text-sm leading-[1.45] md:flex">
                  <Image src="/shop/icons/features/swap-in-seconds-hero.png" alt="" width={28} height={28} aria-hidden className="mt-0.5 h-7 w-7 shrink-0 opacity-80" />
                  <div className="max-w-[31ch]">
                    <p className="font-medium">E-paper ro i hverdagen</p>
                    <p className="text-black/60">Vær, påminnelser og kalender uten mobilscrolling.</p>
                  </div>
                </div>
              </div>
              <div className="relative mt-10 h-[360px] w-full overflow-hidden border-t border-black/10 md:hidden">
                <Image src="/shop/hero-top.png" alt="RE:MIND smart e-paper display on a cabinet" fill priority className="object-cover object-[78%_center]" />
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-full overflow-hidden md:block md:z-0 md:translate-x-[4%]">
                <Image src="/shop/hero-top.png" alt="RE:MIND smart e-paper display on a cabinet" fill priority className="object-cover object-right" />
                <div className="absolute inset-y-0 left-0 w-[42%] bg-[linear-gradient(90deg,#faf9f7_0%,rgba(250,249,247,0.92)_38%,rgba(250,249,247,0.56)_72%,rgba(250,249,247,0)_100%)]" />
              </div>
            </section>
          </div>
        </div>

        <section className="w-full border-y border-black/10 bg-[#faf9f7]">
          <div className="mx-auto grid max-w-[1200px] gap-x-8 gap-y-6 px-6 py-9 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'E-paper display', iconSrc: '/shop/icons/features/swap-in-seconds.png', body: ['Rolig skjerm.', 'Laget for raske blikk.'] },
              { label: 'Wi-Fi-tilkoblet', iconSrc: '/shop/icons/features/premium-materials.png', body: ['Automatiske oppdateringer', 'fra hverdagsdataene dine.'], noWrap: true },
              { label: 'Lansering 2026', iconSrc: '/shop/icons/features/built-to-last.png', body: ['Ventelisten er åpen.', 'Produkter sendes ikke i dag.'] },
              { label: 'Made for Re:mind', iconSrc: '/shop/icons/features/made-for-remind.png', body: ['Rammer og tilbehør', 'kommer ved lansering.'] },
            ].map((item) => (
              <article key={item.label} className="flex items-start gap-3">
                <Image src={item.iconSrc} alt="" width={48} height={48} aria-hidden className="-mt-1 h-[48px] w-[48px] shrink-0 opacity-80" />
                <div className="max-w-[21ch] leading-[1.4]">
                  <p className={`font-medium uppercase tracking-[0.08em] ${item.noWrap ? 'whitespace-nowrap' : ''}`}>{item.label}</p>
                  <p className="mt-1 text-black/60">
                    {item.body[0]}
                    <br />
                    {item.body[1]}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="bg-white">
          <div className="mx-auto max-w-[1200px] px-6 pb-14">
            <ShopReveal>
              <section id="device" className="grid gap-8 border-b border-black/10 py-12 md:grid-cols-[1.05fr_0.95fr] md:items-center md:py-14">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.12em] text-black/50">Komplett smart e-paper device</p>
                  <h2 className="mt-3 text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[46px]">RE:MIND-enheten</h2>
                  <p className="mt-4 max-w-[34ch] text-lg leading-[1.45] text-black/65">Den komplette RE:MIND-opplevelsen.</p>
                  <ul className="mt-6 grid gap-3 text-sm leading-[1.45] text-black/70 sm:grid-cols-2">
                    {['E-paper display', 'Wi-Fi-tilkoblet', 'Vær, påminnelser og kalender', 'Laget for gangen, kjøkkenet og hverdagen'].map((item) => (
                      <li key={item} className="flex gap-2"><span aria-hidden>•</span><span>{item}</span></li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-black/10 bg-[#faf9f7] p-6 shadow-[0_12px_26px_rgba(0,0,0,0.045)] md:p-8">
                  <p className="text-sm uppercase tracking-[0.12em] text-black/50">Forventet lanseringspris</p>
                  <p className="mt-2 text-[42px] font-medium leading-none tracking-[-0.03em]">{devicePrice}</p>
                  <p className="mt-4 max-w-[34ch] text-sm leading-[1.55] text-black/65">
                    Bli med på ventelisten for lanseringsoppdateringer og early-bird tilgang. Produktene sendes ikke i dag.
                  </p>
                  <a href="#waitlist" className="shop-button mt-6 inline-flex rounded bg-black px-7 py-3 text-sm font-medium tracking-wide text-white">
                    Bli med på ventelisten
                  </a>
                </div>
              </section>
            </ShopReveal>

            <ShopReveal delayMs={40}>
              <section id="frames" className="pt-11 pb-12 md:pt-10 md:pb-9">
                <div className="mb-6 flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.09em] text-black/50">Tilbehør til RE:MIND-enheten</p>
                    <h2 className="text-[30px] font-semibold uppercase leading-[1.08] tracking-[0.06em]">Popular Frames</h2>
                  </div>
                  <a className="shrink-0 text-sm uppercase tracking-[0.08em]" href="#waitlist">Reserver din →</a>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {frameCardsLocalized.map((card) => (
                    <article key={card.name} className="shop-card overflow-hidden rounded-lg border border-black/10 bg-[#faf9f7] shadow-[0_10px_22px_rgba(0,0,0,0.04)]">
                      {card.imageSrc ? (
                        <div className="relative aspect-[4/3] overflow-hidden bg-[#faf9f7]">
                          <ShopFadeImage src={card.imageSrc} alt={`${card.name} frame`} fill className="object-cover" />
                        </div>
                      ) : (
                        <div className="p-3"><CornerCrop palette={card.palette} /></div>
                      )}
                      <div className="flex items-start justify-between gap-3 px-3 pt-3 text-lg leading-[1.25]">
                        <h3 className="max-w-[14ch] [text-wrap:balance]">{card.name}</h3>
                        <span>{card.price}</span>
                      </div>
                      <p className="mt-1 max-w-[22ch] px-3 text-sm leading-[1.4] text-black/60">{card.subtitle}</p>
                      <div className="mt-3 flex gap-2 px-3 pb-3">{card.swatches.map((swatch) => <span key={swatch} className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ backgroundColor: swatch }} />)}</div>
                    </article>
                  ))}
                </div>
              </section>
            </ShopReveal>

            <ShopReveal delayMs={60}>
              <section id="mattes" className="relative overflow-hidden rounded-lg border border-black/10 bg-[#f8f7f5] p-8 shadow-[0_12px_26px_rgba(0,0,0,0.045)] md:min-h-[320px] md:p-10">
                <Image src="/shop/mattes-hero.png" alt="" fill aria-hidden className="hidden scale-[1.02] object-contain object-right md:block" sizes="(min-width: 768px) 70vw, 100vw" priority />
                <div className="relative z-10 max-w-[520px]">
                  <p className="text-sm uppercase tracking-[0.09em]">Premium matte</p>
                  <div className="-mx-8 mt-4 overflow-hidden md:hidden">
                    <Image src="/shop/mattes-hero.png" alt="Layered matte frame corners in neutral tones" width={1400} height={700} className="h-auto w-full object-cover" sizes="100vw" priority />
                  </div>
                  <h2 className="mt-4 max-w-[14ch] text-[44px] leading-[1.05] tracking-[-0.02em] sm:text-[50px]">
                    Mykere uttrykk.
                    <br />
                    Mindre gjenskinn.
                  </h2>
                  <p className="mt-5 max-w-[33ch] text-[18px] leading-[1.45] text-black/70">
                    Forventet pris {formatPrice(149, currency)}. Tilgjengelig som tilbehør ved lansering.
                  </p>
                  <a href="#waitlist" className="shop-button mt-7 inline-flex rounded bg-black px-7 py-3 text-sm text-white md:mt-6">Reserver din</a>
                </div>
              </section>
            </ShopReveal>

            <ShopReveal delayMs={90}>
              <section id="accessories" className="pt-11 pb-12 md:pt-9 md:pb-10">
                <div className="mb-6">
                  <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                    <h2 className="text-[24px] font-semibold uppercase leading-[1.08] tracking-[0.06em] whitespace-nowrap sm:text-[30px]">Tilbehør</h2>
                    <a className="shrink-0 text-sm uppercase tracking-[0.08em]" href="#waitlist">Bli med på ventelisten →</a>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {accessoriesLocalized.map((item) => (
                    <article key={item.name} className="shop-card overflow-hidden rounded-lg border border-black/10 bg-[#faf9f7] shadow-[0_10px_22px_rgba(0,0,0,0.04)]">
                      {item.imageSrc ? (
                        <div className="relative aspect-[4/3] overflow-hidden bg-[#ece9e4]">
                          <ShopFadeImage src={item.imageSrc} alt={item.name} fill className="object-cover" />
                        </div>
                      ) : (
                        <div className="p-3"><div className="flex aspect-[16/9] items-center justify-center bg-[#ece9e4] text-5xl">▣</div></div>
                      )}
                      <div className="flex items-start justify-between gap-3 px-3 py-3 text-lg leading-[1.25]"><h3 className="max-w-[16ch]">{item.name}</h3><span>{item.price}</span></div>
                    </article>
                  ))}
                </div>
              </section>
            </ShopReveal>

            <ShopReveal delayMs={110}>
              <section id="bundles" className="grid gap-6 rounded-lg border border-black/10 bg-[#faf9f7] p-7 shadow-[0_12px_26px_rgba(0,0,0,0.045)] md:grid-cols-[1fr_auto] md:items-center md:p-9">
                <div>
                  <p className="text-sm uppercase tracking-[0.12em] text-black/50">Startpakke</p>
                  <h2 className="mt-2 text-[30px] font-semibold leading-[1.08] tracking-[-0.01em]">Home Starter Pack / Startpakke</h2>
                  <p className="mt-4 max-w-[58ch] text-sm leading-[1.6] text-black/65">
                    Inkluderer RE:MIND-enheten + ekstra ramme + cleaning kit. Dette er en komplett enhet med ekstra tilbehør, ikke bare en ramme.
                  </p>
                </div>
                <div className="md:text-right">
                  <p className="text-sm uppercase tracking-[0.12em] text-black/50">Forventet pris</p>
                  <p className="mt-2 text-[34px] font-medium tracking-[-0.02em]">{bundlePrice}</p>
                  <a href="#waitlist" className="shop-button mt-4 inline-flex rounded bg-black px-7 py-3 text-sm font-medium tracking-wide text-white">Reserver din</a>
                </div>
              </section>
            </ShopReveal>

            <ShopReveal delayMs={130}>
              <section id="waitlist" className="mt-12 rounded-lg border border-black/10 bg-white p-7 shadow-[0_12px_26px_rgba(0,0,0,0.045)] md:p-9">
                <div className="mb-6 max-w-[680px]">
                  <p className="text-sm uppercase tracking-[0.12em] text-black/50">Venteliste</p>
                  <h2 className="mt-2 text-[32px] font-semibold leading-[1.08] tracking-[-0.02em]">Bli blant de første som får RE:MIND</h2>
                  <p className="mt-4 text-sm leading-[1.6] text-black/65">
                    Bli med på ventelisten for lanseringsoppdateringer og early-bird tilgang. Vi lanserer etter planen høsten 2026.
                  </p>
                </div>
                <WaitlistForm productInterest="RE:MIND-enheten" />
              </section>
            </ShopReveal>
          </div>
        </div>

        <footer id="about" className="border-t border-black/10 bg-white">
          <div className="border-b border-black/10 bg-[#faf9f7]">
            <div className="mx-auto grid max-w-[1200px] gap-5 px-6 py-5 text-sm sm:grid-cols-3">
              {footerBenefits.map((item) => (
                <article key={item.title} className="flex items-center gap-4">
                  <Image src={item.iconSrc} alt={item.iconAlt} width={48} height={48} className="h-12 w-12 shrink-0 opacity-70" />
                  <p>{item.title}<br /><span className="text-black/60">{item.body}</span></p>
                </article>
              ))}
            </div>
          </div>
          <div className="mx-auto grid max-w-[1200px] gap-x-8 gap-y-9 px-6 py-10 text-sm sm:grid-cols-2 lg:grid-cols-[1.35fr_0.78fr_0.78fr_0.78fr_1.25fr]">
            <div className="pr-4 lg:pr-10">
              <p className="mb-3 font-bold tracking-[0.2em]">RE:MIND</p>
              <p className="max-w-[34ch] leading-[1.55] text-black/65">
                Re-mind gives you what matters,
                <br />
                beautifully displayed. Less screen time.
                <br />
                More presence.
              </p>
              <div className="mt-6 flex items-center gap-5">
                {socialLinks.map((item) => (
                  <a key={item.name} href={item.href} aria-label={item.name} className="shop-social-link inline-flex h-8 w-8 items-center justify-center opacity-75">
                    <Image src={item.iconSrc} alt={item.name} width={item.iconWidth} height={item.iconHeight} className="h-6 w-auto" />
                  </a>
                ))}
              </div>
            </div>
            <div><p className="mb-3 font-medium">VENTELISTE</p><div className="space-y-1.5 leading-[1.4]"><a href="#device" className="shop-footer-link block">RE:MIND-enheten</a><a href="#frames" className="shop-footer-link block">Ekstra rammer</a><a href="#accessories" className="shop-footer-link block">Tilbehør</a><a href="#bundles" className="shop-footer-link block">Startpakke</a></div></div>
            <div><p className="mb-3 font-medium">SUPPORT</p><div className="space-y-1.5 leading-[1.4]"><a href="#waitlist" className="shop-footer-link block">Lanseringsoppdateringer</a><a href="#waitlist" className="shop-footer-link block">Early-bird tilgang</a><a href="/privacy" className="shop-footer-link block">Privacy</a></div></div>
            <div><p className="mb-3 font-medium">COMPANY</p><div className="space-y-1.5 leading-[1.4]"><a href="#about" className="shop-footer-link block">About</a><a href="#waitlist" className="shop-footer-link block">Contact</a><a href="#waitlist" className="shop-footer-link block">Press</a></div></div>
            <div><p className="mb-3 font-medium">STAY IN THE LOOP</p><p className="mb-3 max-w-[30ch] leading-[1.45] text-black/65">Få oppdateringer frem mot lansering høsten 2026.</p><WaitlistForm compact productInterest="RE:MIND footer" /></div>
          </div>
          <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-3 border-t border-black/10 px-6 py-4 text-xs text-black/60 sm:grid-cols-3">
            <p>© 2026 Re-mind. All rights reserved.</p>
            <div className="flex items-center justify-center gap-6">
              <a href="/terms" className="shop-footer-link">Terms</a>
              <a href="/privacy" className="shop-footer-link">Privacy</a>
              <a href="/cookies" className="shop-footer-link">Cookies</a>
            </div>
            <div className="flex justify-start sm:justify-end">
              <ShopLocaleCurrencySelector language={language} currency={currency} />
            </div>
          </div>
        </footer>
      </div>
    </main>
  )
}
