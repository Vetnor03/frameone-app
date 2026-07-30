import type { Metadata } from 'next'
import BundleArtwork from './BundleArtwork'
import { bundleRegularPrice, bundleSavings, shopBundles } from '../bundleData'
import { ShopFooter, ShopHeader } from '../ShopChrome'
import { formatNok, pickShopLocale } from '../productData'
import { shopMetadata } from '../seo'

export const metadata: Metadata = shopMetadata({ title: 'Bundles | RE:MIND', description: 'Save with curated RE:MIND display, frame and matte bundles.', path: '/shop/bundles' })

const norwegianBundleCopy: Record<string, { name: string; eyebrow: string; description: string }> = {
  'complete-home': {
    name: 'Komplettpakken',
    eyebrow: 'Mest for pengene',
    description: 'En komplett RE:MIND med en ekstra ramme og et ekstra innlegg – klar til å endre uttrykk etter rom eller årstid.',
  },
  'frame-pair': {
    name: 'Rammepar',
    eyebrow: 'To nye uttrykk',
    description: 'To utskiftbare rammer og ett innlegg til RE:MIND du allerede har.',
  },
  'style-library': {
    name: 'Stilkolleksjonen',
    eyebrow: 'Mest valgfrihet',
    description: 'Tre rammer og tre innlegg gir deg frihet til å variere uttrykket på RE:MIND.',
  },
}

export default async function BundlesPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const language = pickShopLocale((await searchParams)?.lang)
  const isNorwegian = language === 'no'
  return <main className="shop-page h-screen overflow-y-auto bg-white text-[#141414]">
    <div className="shop-shell mx-auto max-w-[1720px] bg-white">
      <ShopHeader language={language} activeSection="bundles" />
      <section className="mx-auto max-w-[1200px] px-6 py-8 md:py-12">
        <a href={`/shop?lang=${language}`} className="text-xs font-medium uppercase tracking-[.12em] text-black/60">← &nbsp; {isNorwegian ? 'Tilbake til forsiden' : 'Back to home'}</a>
        <div className="mt-6 grid gap-4 border-b border-black/10 pb-7 md:grid-cols-2 md:items-end">
          <h1 className="text-[38px] font-medium uppercase leading-none tracking-[.07em] md:text-[48px]">{isNorwegian ? 'Pakker' : 'Shop bundles'}</h1>
          <p className="max-w-[50ch] leading-7 text-black/60 md:justify-self-end">{isNorwegian ? 'Gjør RE:MIND til din, til en bedre pris. Velg en pakke og sett sammen rammer og innlegg akkurat slik du vil.' : 'More ways to make RE:MIND your own, for less. Pick a set, then choose every frame and matte inside.'}</p>
        </div>
        <div className="mt-8 grid gap-x-5 gap-y-8 sm:grid-cols-2">
          {shopBundles.map((bundle) => {
            const copy = isNorwegian ? norwegianBundleCopy[bundle.id] : bundle
            const contents = isNorwegian
              ? `${bundle.deviceCount ? `${bundle.deviceCount} RE:MIND · ` : ''}${bundle.frameCount} rammer · ${bundle.matteCount} innlegg`
              : `${bundle.deviceCount ? `${bundle.deviceCount} device · ` : ''}${bundle.frameCount} frames · ${bundle.matteCount} ${bundle.matteCount === 1 ? 'matte' : 'mattes'}`

            return <a key={bundle.id} href={`/shop/bundles/${bundle.id}?lang=${language}`} className="group overflow-hidden rounded-lg border border-black/10 bg-[#faf9f7] shadow-[0_10px_24px_rgba(0,0,0,.05)]">
            <div className="aspect-[16/10] overflow-hidden"><BundleArtwork bundle={bundle} /></div>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3"><div className="min-w-0"><p className="text-[10px] font-medium uppercase tracking-[.15em] text-black/50">{copy.eyebrow}</p><h2 className="mt-2 text-2xl font-medium">{copy.name}</h2></div><span className="shrink-0 whitespace-nowrap rounded-full bg-[#dfe9d8] px-3 py-1 text-xs font-medium text-[#29421f]">{isNorwegian ? 'Spar' : 'Save'} {formatNok(bundleSavings(bundle), language)}</span></div>
              <p className="mt-3 text-sm leading-6 text-black/60">{copy.description}</p>
              <div className="mt-5 flex flex-col gap-3 border-t border-black/10 pt-4 sm:flex-row sm:items-end sm:justify-between"><p className="text-sm">{contents}</p><p className="flex shrink-0 items-baseline gap-2 whitespace-nowrap"><span className="text-sm text-black/40 line-through">{formatNok(bundleRegularPrice(bundle), language)}</span><strong className="font-medium">{formatNok(bundle.price, language)}</strong></p></div>
            </div>
          </a>})}
        </div>
      </section>
      <ShopFooter language={language} />
    </div>
  </main>
}
