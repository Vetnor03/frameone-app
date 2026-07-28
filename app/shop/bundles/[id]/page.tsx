import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { shopBundles } from '../../bundleData'
import { ShopFooter, ShopHeader } from '../../ShopChrome'
import BundleConfigurator from './BundleConfigurator'
import { shopMetadata } from '../../seo'

type Props = { params: Promise<{ id: string }> }

export function generateStaticParams() {
  return shopBundles.map(({ id }) => ({ id }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const bundle = shopBundles.find((item) => item.id === id)
  return bundle ? shopMetadata({ title: `${bundle.name} | RE:MIND`, description: bundle.description, path: `/shop/bundles/${bundle.id}` }) : {}
}

export default async function BundlePage({ params }: Props) {
  const { id } = await params
  const bundle = shopBundles.find((item) => item.id === id)
  if (!bundle) notFound()

  return (
    <main className="shop-page h-screen overflow-y-auto bg-white text-[#141414]">
      <div className="shop-shell mx-auto max-w-[1720px] bg-white">
        <ShopHeader language="en" activeSection="bundles" />
        <section className="mx-auto max-w-[1200px] px-6 py-8 md:py-12">
          <a href="/shop/bundles" className="text-xs font-medium uppercase tracking-[.12em] text-black/60">← &nbsp; All bundles</a>
          <div className="mt-6 border-b border-black/10 pb-6">
            <p className="text-xs font-medium uppercase tracking-[.15em] text-black/50">{bundle.eyebrow}</p>
            <h1 className="mt-3 text-[36px] font-medium leading-none md:text-[48px]">{bundle.name}</h1>
            <p className="mt-4 max-w-[58ch] leading-7 text-black/60">{bundle.description} Choose each component below to make the bundle yours.</p>
          </div>
          <BundleConfigurator bundle={bundle} />
        </section>
        <ShopFooter language="en" />
      </div>
    </main>
  )
}
