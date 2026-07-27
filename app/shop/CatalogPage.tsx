import Image from 'next/image'
import { ShopFooter, ShopHeader } from './ShopChrome'
import { formatNok } from './productData'

export type CatalogItem = {
  id: string
  name: string
  subtitle: string
  price: number
  colors: [string, string]
  imageSrc?: string
}

type CatalogPageProps = {
  kind: 'frames' | 'mattes'
  title: string
  intro: string
  items: CatalogItem[]
}

export function PlaceholderFigure({ colors, kind }: Pick<CatalogItem, 'colors'> & { kind: CatalogPageProps['kind'] }) {
  if (kind === 'mattes') {
    return (
      <div className="relative h-full w-full bg-[#e8e3dd]">
        <div className="absolute left-[18%] top-[12%] h-[76%] w-[64%] rotate-[-7deg] shadow-[0_10px_20px_rgba(0,0,0,0.16)]" style={{ backgroundColor: colors[1] }} />
        <div className="absolute left-[25%] top-[17%] h-[68%] w-[62%] rotate-[7deg] p-[16%] shadow-[0_10px_20px_rgba(0,0,0,0.2)]" style={{ backgroundColor: colors[0] }}>
          <div className="h-full w-full bg-[#d7d2cb]" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full bg-[radial-gradient(circle_at_30%_25%,#fff,#e7e2dc)]">
      <div className="absolute -bottom-[14%] -left-[9%] h-[78%] w-[88%] rotate-[-9deg] border-[22px] shadow-[0_12px_24px_rgba(0,0,0,0.2)]" style={{ borderColor: colors[0], backgroundColor: colors[1] }} />
    </div>
  )
}

export default function CatalogPage({ kind, title, intro, items }: CatalogPageProps) {
  const language = 'en' as const
  const currency = 'NOK' as const

  return (
    <main className="shop-page h-screen overflow-y-auto overflow-x-hidden bg-white text-[#141414]" style={{ marginTop: 'calc(env(safe-area-inset-top) * -1)', paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="shop-shell mx-auto w-full max-w-[2560px] bg-white 2xl:max-w-[1720px]">
        <ShopHeader language={language} currency={currency} activeSection={kind} />
        <section className="mx-auto max-w-[1200px] px-6 py-8 md:py-10">
          <div className="mb-7 border-b border-black/10 pb-6">
            <a
              href="/shop"
              className="group inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-black/60 hover:text-black focus-visible:text-black"
            >
              <span aria-hidden className="text-base leading-none transition-transform group-hover:-translate-x-0.5">←</span>
              Back to home
            </a>
            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] md:items-end md:gap-12">
              <h1 className="text-[38px] font-medium uppercase leading-none tracking-[0.07em] md:text-[48px]">{title}</h1>
              <p className="max-w-[48ch] text-base leading-relaxed text-black/60 md:justify-self-end">{intro}</p>
            </div>
          </div>
          <div className="grid gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item, index) => (
              <a
                key={item.id}
                href={`/shop/${kind}/${encodeURIComponent(item.id)}`}
                className="shop-card block overflow-hidden rounded-lg border border-black/10 bg-[#faf9f7] shadow-[0_10px_22px_rgba(0,0,0,0.04)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                aria-label={`Choose ${item.name} ${kind === 'frames' ? 'frame' : 'matte'}`}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-[#eeeae5]">
                  {item.imageSrc ? <Image src={item.imageSrc} alt={`${item.name} ${kind === 'frames' ? 'frame' : 'matte'}`} fill className="object-cover" sizes="(min-width: 1024px) 280px, (min-width: 640px) 50vw, 100vw" /> : <PlaceholderFigure colors={item.colors} kind={kind} />}
                  {!item.imageSrc && <span className="absolute bottom-2 right-2 text-[10px] uppercase tracking-[0.12em] text-black/45">Preview {String(index + 1).padStart(2, '0')}</span>}
                </div>
                <div className="flex items-start justify-between gap-3 px-3 pt-3 text-lg leading-[1.25]">
                  <h2 className="max-w-[14ch] [text-wrap:balance]">{item.name}</h2>
                  <span className="shrink-0">{formatNok(item.price)}</span>
                </div>
                <p className="mt-1 px-3 text-sm leading-[1.4] text-black/60">{item.subtitle}</p>
                <div className="mt-3 flex gap-2 px-3 pb-3">{item.colors.map((color) => <span key={color} className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ backgroundColor: color }} />)}</div>
              </a>
            ))}
          </div>
        </section>
        <ShopFooter language={language} currency={currency} />
      </div>
    </main>
  )
}
