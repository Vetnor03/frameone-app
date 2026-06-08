import Image from 'next/image'
import { ShopFadeImage, ShopMobileMenu, ShopReveal } from './ShopMotion'
import ShopLocaleCurrencySelector from './ShopLocaleCurrencySelector'
import WaitlistForm from './WaitlistForm'
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
  imageSrc?: string
}

const frameCards: FrameCard[] = [
  {
    name: 'Black Frame',
    price: '349 NOK',
    subtitle: 'Matte aluminum',
    palette: ['#111214', '#252628', '#3c3d40'],
    swatches: ['#111214', '#d5d5d5'],
    imageSrc: '/shop/frames/midnight-black.png',
  },
  {
    name: 'Walnut Frame',
    price: '399 NOK',
    subtitle: 'Real walnut',
    palette: ['#5a3a2a', '#7a513c', '#946550'],
    swatches: ['#6a4633', '#8a624a'],
    imageSrc: '/shop/frames/walnut-wood.png',
  },
  {
    name: 'Oak Frame',
    price: '399 NOK',
    subtitle: 'Real oak',
    palette: ['#b5824f', '#cb9b67', '#deb57e'],
    swatches: ['#bb8d5f', '#d8be9f'],
    imageSrc: '/shop/frames/natural-oak.png',
  },
  {
    name: 'White Frame',
    price: '349 NOK',
    subtitle: 'Matte aluminum',
    palette: ['#e8e7e3', '#f2f2ee', '#dbdad5'],
    swatches: ['#f0f0ef', '#cfcfcf'],
    imageSrc: '/shop/frames/cloud-white.png',
  },
]

type AccessoryCard = {
  name: string
  price: string
  imageSrc?: string
}

const accessories: AccessoryCard[] = [
  { name: 'Desk Stand', price: '199 NOK', imageSrc: '/shop/accessories/desk-stand.png' },
  { name: 'Wall Mount', price: '149 NOK', imageSrc: '/shop/accessories/wall-mount.png' },
  { name: 'Cleaning Kit', price: '79 NOK', imageSrc: '/shop/accessories/cleaning-kit.png' },
  { name: 'Replacement Glass', price: '99 NOK', imageSrc: '/shop/accessories/replacement-glass.png' },
]


const socialLinks = [
  { name: 'Instagram', href: '#', iconSrc: '/shop/icons/social/instagram.png', iconWidth: 1024, iconHeight: 1024 },
  { name: 'Facebook', href: '#', iconSrc: '/shop/icons/social/facebook.png', iconWidth: 1024, iconHeight: 1024 },
  { name: 'Pinterest', href: '#', iconSrc: '/shop/icons/social/pinterest.png', iconWidth: 1536, iconHeight: 1024 },
] as const

function CornerCrop({ palette }: { palette: [string, string, string] }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-[#faf9f7]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_24%,rgba(255,255,255,0.7),transparent_55%)]" />
      <div
        className="absolute left-8 top-8 h-40 w-40 rotate-[-18deg] border-[14px]"
        style={{ borderColor: palette[0], boxShadow: `0 0 0 1px ${palette[1]} inset, 0 12px 22px rgba(0,0,0,0.12)` }}
      >
        <div
          className="h-full w-full"
          style={{ background: `linear-gradient(145deg, ${palette[1]}, ${palette[2]})` }}
        />
      </div>
    </div>
  )
}

function pickLang(v?: string): 'en' | 'no' { return v === 'no' ? 'no' : 'en' }
function pickCurrency(): 'NOK' { return 'NOK' }
function formatNok(value: number) {
  return `${value.toLocaleString('nb-NO').replace(/ /g, ' ')} NOK`
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string; currency?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const language = pickLang(resolvedSearchParams?.lang)
  const currency = pickCurrency()
  const frameCardsLocalized = frameCards
  const accessoriesLocalized = accessories
  const topShipping = formatNok(1000)
  const footerBenefits = [
    {
      title: 'FREE SHIPPING',
      body: `On orders over ${topShipping}`,
      iconSrc: '/shop/icons/footer/free-shipping.png',
      iconAlt: 'Delivery truck icon',
    },
    {
      title: '30 DAY RETURNS',
      body: 'No questions asked',
      iconSrc: '/shop/icons/footer/returns-30-day.png',
      iconAlt: 'Circular arrows return icon',
    },
    {
      title: '2 YEAR WARRANTY',
      body: 'Peace of mind',
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
      <div className="shop-shell w-full max-w-[2560px] mx-auto bg-white 2xl:max-w-[1720px]">
      <div className="bg-[#0b0d10] text-[11px] text-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-3 px-6 py-2 tracking-[0.02em] sm:gap-5">
          <span>{language === 'no' ? `Gratis frakt over ${topShipping}` : `Free shipping over ${topShipping}`}</span>
          <span className="h-3 w-px bg-white/35" aria-hidden />
          <span>30 day returns</span>
          <span className="h-3 w-px bg-white/35" aria-hidden />
          <span>2 year warranty</span>
        </div>
      </div>

      <header className="border-b border-black/10 bg-[#faf9f7]">
        <div className="mx-auto max-w-[1200px] px-6 py-6 md:px-14">
          <div className="relative flex items-center justify-between md:justify-center">
            <a href="https://re-mind.no/shop" className="text-[29px] font-medium tracking-[0.28em] md:absolute md:left-0">RE:MIND</a>
            <nav className="hidden items-center justify-center gap-10 text-sm uppercase tracking-[0.09em] md:flex shop-nav">
              <a href="#frames" className="border-b-2 border-black pb-1">Frames</a>
              <a href="#mattes" className="pb-1">Mattes</a>
              <a href="#accessories" className="pb-1">Accessories</a>
              <a href="#bundles" className="pb-1">Bundles</a>
              <a href="#about" className="pb-1">About</a>
            </nav>
            <div className="hidden items-center gap-3">
            <button
              type="button"
              aria-label="Open profile"
              className="shop-icon-button inline-flex items-center justify-center p-1 text-black/75"
            >
              <Image
                src="/shop/icons/header/profile.png"
                alt=""
                aria-hidden
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
              />
            </button>
            <button
              type="button"
              aria-label="Open waitlist"
              className="shop-icon-button inline-flex items-center justify-center p-1 text-black/75"
            >
              <Image
                src="/shop/icons/header/cart.png"
                alt=""
                aria-hidden
                width={44}
                height={44}
                className="h-11 w-11 object-contain"
              />
            </button>
            </div>
          </div>
          <div className="pt-4 md:hidden">
            <ShopMobileMenu>
              <nav className="shop-nav flex flex-col items-start gap-3 text-left text-sm uppercase tracking-[0.09em]">
                <a href="#frames" className="pb-1">Frames</a>
                <a href="#mattes" className="pb-1">Mattes</a>
                <a href="#accessories" className="pb-1">Accessories</a>
                <a href="#bundles" className="pb-1">Bundles</a>
                <a href="#about" className="pb-1">About</a>
              </nav>
            </ShopMobileMenu>
          </div>
        </div>
      </header>

      <div className="bg-[#faf9f7]">
        <div className="mx-auto max-w-[1200px]">
          <section className="relative py-10 md:min-h-[585px] md:py-0">
            <div className="relative z-10 mx-auto flex max-w-[26rem] flex-col px-6 py-3 md:-mt-6 md:min-h-[585px] md:max-w-none md:justify-center md:py-8 md:pl-14 md:pr-10">
              <h1 className="max-w-[12.4ch] text-[38px] font-medium leading-[1.04] tracking-[-0.03em] sm:text-[48px] md:text-[56px]">
                <span className="block">Frames that</span>
                <span className="block">fit your life.</span>
              </h1>
              <p className="mt-5 max-w-[27ch] text-[17px] leading-[1.45] text-black/65 md:mt-6 md:max-w-[31ch] md:text-[18px]">
                Swap in seconds. Designed to complement your home, your style, your day.
              </p>
              <a className="shop-button mt-9 w-fit rounded bg-black px-8 py-3 text-sm font-medium tracking-wide text-white md:mt-9" href="#remind">JOIN WAITLIST</a>
              <div className="mt-8 hidden items-start gap-3 text-sm leading-[1.45] md:flex">
                <Image
                  src="/shop/icons/features/swap-in-seconds-hero.png"
                  alt=""
                  width={28}
                  height={28}
                  aria-hidden
                  className="mt-0.5 h-7 w-7 shrink-0 opacity-80"
                />
                <div className="max-w-[30ch]">
                  <p className="font-medium">Swap in seconds</p>
                  <p className="text-black/60">Satisfying click. Designed for ease.</p>
                </div>
              </div>
            </div>
            <div className="relative mt-10 h-[360px] w-full overflow-hidden border-t border-black/10 md:hidden">
              <Image
                src="/shop/hero-top.png"
                alt="Re:mind frames on a cabinet"
                fill
                priority
                className="object-cover object-[78%_center]"
              />
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-full overflow-hidden md:block md:translate-x-[4%] md:z-0">
              <Image
                src="/shop/hero-top.png"
                alt="Re:mind frames on a cabinet"
                fill
                priority
                className="object-cover object-right"
              />
              <div className="absolute inset-y-0 left-0 w-[42%] bg-[linear-gradient(90deg,#faf9f7_0%,rgba(250,249,247,0.92)_38%,rgba(250,249,247,0.56)_72%,rgba(250,249,247,0)_100%)]" />
            </div>
          </section>
        </div>
      </div>

      <section className="w-full border-y border-black/10 bg-[#faf9f7]">
        <div className="mx-auto grid max-w-[1200px] gap-x-8 gap-y-6 px-6 py-9 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Swap in seconds', iconSrc: '/shop/icons/features/swap-in-seconds.png', body: ['Satisfying click.', 'Designed for ease.'] },
            { label: 'Premium materials', iconSrc: '/shop/icons/features/premium-materials.png', body: ['Real wood, aluminium', 'and carefully selected finishes.'], noWrap: true },
            { label: 'Built to last', iconSrc: '/shop/icons/features/built-to-last.png', body: ['Sustainable design.', 'Made to be kept.'] },
            { label: 'Made for Re:mind', iconSrc: '/shop/icons/features/made-for-remind.png', body: ['Perfect fit. Seamless', 'integration.'] },
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
        <div className="mx-auto max-w-[1200px] px-6 pt-11">
          <ShopReveal><section id="remind" className="relative grid overflow-hidden rounded-lg border border-black/10 bg-[#f8f7f5] p-8 shadow-[0_12px_26px_rgba(0,0,0,0.045)] md:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] md:items-center md:gap-12 md:p-10">
            <div className="relative z-10 max-w-[620px]">
              <p className="text-sm uppercase tracking-[0.09em]">RE:MIND</p>
              <h2 className="mt-4 max-w-[14ch] text-[44px] leading-[1.05] tracking-[-0.02em] sm:text-[50px]">RE:MIND</h2>
              <p className="mt-5 max-w-[33ch] text-[18px] leading-[1.45] text-black/70">
                Re-mind gives you what matters,
                <br />
                beautifully displayed. Less screen time.
                <br />
                More presence.
              </p>
              <ul className="mt-6 grid gap-2 text-sm leading-[1.45] text-black/70 sm:grid-cols-2">
                {['Family reminders', 'Calendar events', 'Weather forecasts', 'Work updates', 'School updates', 'Grocery lists'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-black" aria-hidden>✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-7 text-base font-medium tracking-[0.02em] text-black/80">Expected launch price: {formatNok(1990)}</p>
            </div>
            <div className="relative z-10 flex w-full items-center">
              <WaitlistForm />
            </div>
          </section></ShopReveal>
        </div>
      </div>

      <div className="bg-white">
        <div className="mx-auto max-w-[1200px] px-6 pb-14">
          <ShopReveal><section id="frames" className="pt-11 pb-12 md:pt-10 md:pb-9">
          <div className="mb-6 flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <h2 className="text-[30px] font-semibold uppercase leading-[1.08] tracking-[0.06em]">Popular Frames</h2>
            <a className="shrink-0 text-sm uppercase tracking-[0.08em]" href="#">View all frames →</a>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {frameCardsLocalized.map((card) => (
              <article key={card.name} className="shop-card overflow-hidden rounded-lg border border-black/10 bg-[#faf9f7] shadow-[0_10px_22px_rgba(0,0,0,0.04)]">
                {card.imageSrc ? (
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#faf9f7]">
                    <ShopFadeImage src={card.imageSrc} alt={`${card.name} frame`} fill className="object-cover" />
                  </div>
                ) : (
                  <div className="p-3">
                    <CornerCrop palette={card.palette} />
                  </div>
                )}
                <div className="px-3 pt-3 flex items-start justify-between gap-3 text-lg leading-[1.25]">
                  <h3 className="max-w-[14ch] [text-wrap:balance]">{card.name}</h3>
                  <span>{card.price}</span>
                </div>
                <p className="mt-1 max-w-[20ch] px-3 text-sm leading-[1.4] text-black/60">{card.subtitle}</p>
                <div className="mt-3 px-3 pb-3 flex gap-2">{card.swatches.map((swatch) => <span key={swatch} className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ backgroundColor: swatch }} />)}</div>
              </article>
            ))}
          </div>
        </section></ShopReveal>

          <ShopReveal delayMs={50}><section id="mattes" className="relative overflow-hidden rounded-lg border border-black/10 bg-[#f8f7f5] p-8 shadow-[0_12px_26px_rgba(0,0,0,0.045)] md:min-h-[320px] md:p-10">
          <Image
            src="/shop/mattes-hero.png"
            alt=""
            fill
            aria-hidden
            className="hidden scale-[1.02] object-contain object-right md:block"
            sizes="(min-width: 768px) 70vw, 100vw"
            priority
          />
          <div className="relative z-10 max-w-[520px]">
            <p className="text-sm uppercase tracking-[0.09em]">Mattes</p>
            <div className="-mx-8 mt-4 overflow-hidden md:hidden">
              <Image
                src="/shop/mattes-hero.png"
                alt="Layered matte frame corners in neutral tones"
                width={1400}
                height={700}
                className="h-auto w-full object-cover"
                sizes="100vw"
                priority
              />
            </div>
            <h2 className="mt-4 max-w-[14ch] text-[44px] leading-[1.05] tracking-[-0.02em] sm:text-[50px]">
              Change the feel.
              <br />
              Not the frame.
            </h2>
            <p className="mt-5 max-w-[33ch] text-[18px] leading-[1.45] text-black/70">
              Choose the perfect matte to match
              <br />
              your space and reduce glare.
            </p>
            <a className="shop-button mt-7 inline-block rounded bg-black px-7 py-3 text-sm text-white md:mt-6" href="#remind">Reserve Yours</a>
          </div>
        </section></ShopReveal>

          <ShopReveal delayMs={90}><section id="accessories" className="pt-11 pb-12 md:pt-9 md:pb-10">
          <div className="mb-6">
            <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <h2 className="text-[24px] font-semibold uppercase leading-[1.08] tracking-[0.06em] whitespace-nowrap sm:text-[30px]">
                COMPLETE THE EXPERIENCE
              </h2>
              <a className="shrink-0 text-sm uppercase tracking-[0.08em]" href="#">View all accessories →</a>
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
                  <div className="p-3">
                    <div className="flex aspect-[16/9] items-center justify-center bg-[#ece9e4] text-5xl">▣</div>
                  </div>
                )}
                <div className="px-3 py-3 flex items-start justify-between gap-3 text-lg leading-[1.25]"><h3 className="max-w-[16ch]">{item.name}</h3><span>{item.price}</span></div>
              </article>
            ))}
          </div>
          </section></ShopReveal>
        </div>
        </div>

      <footer id="about" className="border-t border-black/10 bg-white">
        <div className="border-b border-black/10 bg-[#faf9f7]">
          <div className="mx-auto grid max-w-[1200px] gap-5 px-6 py-5 text-sm sm:grid-cols-3">
            {footerBenefits.map((item) => (
              <article key={item.title} className="flex items-center gap-4">
                <Image
                  src={item.iconSrc}
                  alt={item.iconAlt}
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 opacity-70"
                />
                <p>
                  {item.title}
                  <br />
                  <span className="text-black/60">{item.body}</span>
                </p>
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
                <a
                  key={item.name}
                  href={item.href}
                  aria-label={item.name}
                  className="shop-social-link inline-flex h-8 w-8 items-center justify-center opacity-75"
                >
                  <Image
                    src={item.iconSrc}
                    alt={item.name}
                    width={item.iconWidth}
                    height={item.iconHeight}
                    className="h-6 w-auto"
                  />
                </a>
              ))}
            </div>
          </div>
          <div><p className="mb-3 font-medium">SHOP</p><div className="space-y-1.5 leading-[1.4]"><a href="#frames" className="shop-footer-link block">Frames</a><a href="#mattes" className="shop-footer-link block">Mattes</a><a href="#accessories" className="shop-footer-link block">Accessories</a><a href="#bundles" className="shop-footer-link block">Bundles</a></div></div>
          <div><p className="mb-3 font-medium">SUPPORT</p><div className="space-y-1.5 leading-[1.4]"><a href="#" className="shop-footer-link block">FAQ</a><a href="#" className="shop-footer-link block">Shipping</a><a href="#" className="shop-footer-link block">Returns</a><a href="#" className="shop-footer-link block">Warranty</a></div></div>
          <div><p className="mb-3 font-medium">COMPANY</p><div className="space-y-1.5 leading-[1.4]"><a href="#about" className="shop-footer-link block">About</a><a href="#" className="shop-footer-link block">Sustainability</a><a href="#" className="shop-footer-link block">Contact</a><a href="#" className="shop-footer-link block">Press</a></div></div>
          <div><p className="mb-3 font-medium">STAY IN THE LOOP</p><p className="max-w-[30ch] leading-[1.45] text-black/65">New frames, updates and ideas.</p><WaitlistForm compact source="shop-footer" /></div>
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
