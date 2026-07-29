import Image from 'next/image'
import { ShopFooter, ShopHeader } from './ShopChrome'
import { ShopFadeImage, ShopReveal } from './ShopMotion'
import { formatNok, remindProduct, shopFrames } from './productData'
import type { Metadata } from 'next'
import { SHOP_DESCRIPTION, shopMetadata } from './seo'

export const metadata: Metadata = shopMetadata({
  title: 'RE:MIND | What matters. Beautifully displayed.',
  description: SHOP_DESCRIPTION,
  path: '/shop',
})

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
export default async function ShopPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const language = pickLang(resolvedSearchParams?.lang)
  const frameCardsLocalized = shopFrames.filter((frame) => frame.imageSrc)
  const topShipping = formatNok(1000, language)
  const configureHref = `/shop/configure?lang=${language}`

  const productStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: remindProduct.name,
    description: SHOP_DESCRIPTION,
    image: 'https://re-mind.no/shop/remind-device-v2.png',
    brand: { '@type': 'Brand', name: 'RE:MIND' },
    offers: {
      '@type': 'Offer',
      url: 'https://re-mind.no/shop/configure',
      priceCurrency: 'NOK',
      price: remindProduct.price,
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  }


  return (
    <main
      className="shop-page h-screen overflow-y-auto overflow-x-hidden bg-white text-[#141414]"
      style={{
        marginTop: 'calc(env(safe-area-inset-top) * -1)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productStructuredData).replace(/</g, '\\u003c') }}
      />
      <div className="shop-shell w-full max-w-[2560px] mx-auto bg-white 2xl:max-w-[1720px]">
      <ShopHeader language={language} shippingThreshold={topShipping} />

      <div className="bg-[#faf9f7]">
        <div className="mx-auto max-w-[1200px]">
          <section className="relative py-10 md:min-h-[585px] md:py-0">
            <div className="relative z-10 mx-auto flex max-w-[26rem] flex-col px-6 py-3 md:min-h-[585px] md:max-w-none md:justify-center md:py-8 md:pl-14 md:pr-10">
              <h1 className={`${language === 'no' ? 'max-w-[18ch]' : 'max-w-[12.4ch]'} text-[38px] font-medium leading-[1.04] tracking-[-0.03em] sm:text-[48px] md:text-[56px]`}>
                <span className={language === 'no' ? 'block max-w-[12.4ch]' : 'block'}>{language === 'no' ? 'Designet for hjemmet.' : 'Frames that'}</span>
                <span className={language === 'no' ? 'mt-[0.22em] block text-[0.71em] font-normal leading-[1.08] tracking-[-0.02em] md:whitespace-nowrap' : 'block'}>{language === 'no' ? 'Skapt for hverdagen.' : 'fit your life.'}</span>
              </h1>
              <p className="mt-5 max-w-[27ch] text-[17px] leading-[1.45] text-black/65 md:mt-6 md:max-w-[31ch] md:text-[18px]">
                {language === 'no' ? (
                  <>
                    <span className="md:block">Påminnelser, vær og det som skjer –</span>{' '}
                    <span className="md:block">samlet på ett sted, med mindre</span>{' '}
                    <span className="md:block">skjermtid.</span>
                  </>
                ) : (
                  <>
                    <span className="md:block">Reminders, weather and events</span>{' '}
                    <span className="md:block">at a glance,</span>{' '}
                    <span className="md:block">without checking your phone.</span>
                  </>
                )}
              </p>
              <a className="shop-button mt-7 w-fit rounded bg-black px-8 py-3 text-sm font-medium tracking-wide text-white md:mt-8" href={configureHref}>{language === 'no' ? 'SE RAMMER' : 'SHOP FRAMES'}</a>
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
                alt="RE:MIND frames on a cabinet"
                fill
                priority
                className="object-cover object-[78%_center]"
              />
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-full overflow-hidden md:block md:translate-x-[4%] md:z-0">
              <Image
                src="/shop/hero-top.png"
                alt="RE:MIND frames on a cabinet"
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
            { label: 'Made for RE:MIND', iconSrc: '/shop/icons/features/made-for-remind.png', body: ['Perfect fit. Seamless', 'integration.'] },
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
          <ShopReveal><section id="remind" className="relative grid items-center gap-8 py-10 md:py-12 lg:block lg:py-14">
            <div className="relative z-0 aspect-[16/9] w-full overflow-visible lg:w-[calc(100%_-_320px)]">
              <Image
                src="/shop/remind-device-v2.png"
                alt="RE:MIND device"
                fill
                className="object-contain lg:scale-[1.22]"
                sizes="(min-width: 1024px) 855px, (min-width: 768px) calc(100vw - 48px), calc(100vw - 48px)"
              />
            </div>
            <div className="relative z-10 flex flex-col items-center justify-center text-center lg:absolute lg:inset-y-0 lg:right-0 lg:w-[300px]">
              <div>
                <h2 className="text-[30px] font-medium leading-none tracking-[0.12em] sm:text-[34px]">RE:MIND</h2>
                <p className="mt-5 text-[19px] leading-tight tracking-[0.02em]">Complete RE:MIND from {formatNok(remindProduct.price, language)}</p>
                <div className="mt-5 max-w-[32rem] lg:max-w-[300px]">
                  <p className="text-xs font-medium uppercase tracking-[0.15em]">What’s included</p>
                  <p className="mt-2 text-[13px] leading-5 text-black/60">
                    RE:MIND display · Your frame · Your matte · Charging cable · Setup guide
                  </p>
                </div>
              </div>
              <a
                href={configureHref}
                className="shop-button mt-8 w-full rounded bg-black px-8 py-3.5 text-sm font-medium tracking-wide text-white sm:w-fit"
              >
                MAKE IT YOURS
              </a>
            </div>
          </section></ShopReveal>

          <ShopReveal><section id="frames" className="pt-8 pb-12 md:pt-7 md:pb-9">
          <div className="mb-6 flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <h2 className="text-[30px] font-semibold uppercase leading-[1.08] tracking-[0.06em]">Popular Frames</h2>
            <a className="shrink-0 text-sm uppercase tracking-[0.08em]" href={`/shop/frames?lang=${language}`}>View all frames →</a>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {frameCardsLocalized.map((card) => (
              <a
                key={card.id}
                href={`/shop/frames/${encodeURIComponent(card.id)}?lang=${language}`}
                className="shop-card block overflow-hidden rounded-lg border border-black/10 bg-[#faf9f7] shadow-[0_10px_22px_rgba(0,0,0,0.04)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                aria-label={`Choose ${card.name} frame`}
              >
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
                  {card.price !== null && <span>{formatNok(card.price, language)}</span>}
                </div>
                <p className="mt-1 max-w-[20ch] px-3 text-sm leading-[1.4] text-black/60">{card.subtitle}</p>
                <div className="mt-3 px-3 pb-3 flex gap-2">{card.swatches.map((swatch) => <span key={swatch} className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ backgroundColor: swatch }} />)}</div>
              </a>
            ))}
          </div>
        </section></ShopReveal>

          <ShopReveal delayMs={50}><section id="mattes" className="relative overflow-hidden rounded-lg border border-black/10 bg-[#eee9e4] p-8 shadow-[0_12px_26px_rgba(0,0,0,0.045)] md:min-h-[320px] md:p-10">
          <Image
            src="/shop/mattes-hero.png"
            alt=""
            fill
            aria-hidden
            className="hidden scale-[1.02] object-contain object-right md:block"
            sizes="(min-width: 768px) 70vw, 100vw"
            priority
          />
          <div
            aria-hidden
            className="absolute inset-0 hidden bg-[linear-gradient(90deg,#f5f2ee_0%,#f5f2ee_34%,rgba(245,242,238,0.92)_39%,rgba(245,242,238,0.58)_46%,rgba(245,242,238,0)_54%)] md:block"
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
            <a className="shop-button mt-7 inline-block rounded bg-black px-7 py-3 text-sm text-white md:mt-6" href={`/shop/mattes?lang=${language}`}>SHOP MATTES</a>
          </div>
        </section></ShopReveal>

        </div>
        </div>

      <ShopFooter language={language} shippingThreshold={topShipping} />
      </div>
    </main>
  )
}
