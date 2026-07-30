import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { shopBundles } from '../../bundleData'
import { ShopFooter, ShopHeader } from '../../ShopChrome'
import BundleConfigurator from './BundleConfigurator'
import { shopMetadata } from '../../seo'
import { pickShopLocale } from '../../productData'

type Props = { params: Promise<{ id: string }>; searchParams?: Promise<{ lang?: string }> }

const norwegianBundleCopy: Record<string, { name: string; eyebrow: string; description: string }> = {
  'complete-home': { name: 'Komplettpakken', eyebrow: 'MEST FOR PENGENE', description: 'En komplett RE:MIND med en ekstra ramme og et ekstra innlegg – klar til å endre uttrykk etter rom eller årstid. Velg delene nedenfor og sett sammen pakken slik du vil.' },
  'frame-pair': { name: 'Rammepar', eyebrow: 'TO NYE UTTRYKK', description: 'To utskiftbare rammer og ett innlegg til en RE:MIND du allerede har. Velg delene nedenfor og sett sammen pakken slik du vil.' },
  'style-library': { name: 'Stilkolleksjonen', eyebrow: 'MEST VALGFRIHET', description: 'Tre rammer og tre innlegg gir deg frihet til å variere uttrykket på RE:MIND. Velg delene nedenfor og sett sammen pakken slik du vil.' },
}

export function generateStaticParams() {
  return shopBundles.map(({ id }) => ({ id }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const bundle = shopBundles.find((item) => item.id === id)
  return bundle ? shopMetadata({ title: `${bundle.name} | RE:MIND`, description: bundle.description, path: `/shop/bundles/${bundle.id}` }) : {}
}

export default async function BundlePage({ params, searchParams }: Props) {
  const { id } = await params
  const bundle = shopBundles.find((item) => item.id === id)
  if (!bundle) notFound()
  const language = pickShopLocale((await searchParams)?.lang)
  const copy = language === 'no' ? norwegianBundleCopy[bundle.id] : {
    name: bundle.name,
    eyebrow: bundle.eyebrow,
    description: `${bundle.description} Choose each component below to make the bundle yours.`,
  }

  return (
    <main className="shop-page h-screen overflow-y-auto bg-white text-[#141414]">
      <div className="shop-shell mx-auto max-w-[1720px] bg-white">
        <ShopHeader language={language} activeSection="bundles" />
        <section className="mx-auto max-w-[1200px] px-6 py-8 md:py-12">
          <a href={`/shop/bundles?lang=${language}`} className="text-xs font-medium uppercase tracking-[.12em] text-black/60">← &nbsp; {language === 'no' ? 'ALLE PAKKER' : 'All bundles'}</a>
          <div className="mt-6 border-b border-black/10 pb-6">
            <p className="text-xs font-medium uppercase tracking-[.15em] text-black/50">{copy.eyebrow}</p>
            <h1 className="mt-3 text-[36px] font-medium leading-none md:text-[48px]">{copy.name}</h1>
            <p className="mt-4 max-w-[58ch] leading-7 text-black/60">{copy.description}</p>
          </div>
          <BundleConfigurator bundle={bundle} language={language} />
        </section>
        <ShopFooter language={language} />
      </div>
    </main>
  )
}
