import type { Metadata } from 'next'
import CatalogPage from '../CatalogPage'
import { frameCatalog } from '../catalogData'
import { shopMetadata } from '../seo'
import { pickShopLocale } from '../productData'

export const metadata: Metadata = shopMetadata({ title: 'Frames | RE:MIND', description: 'Explore interchangeable RE:MIND frame finishes, from matte aluminum to real wood.', path: '/shop/frames' })

export default async function FramesPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const language = pickShopLocale((await searchParams)?.lang)
  return <CatalogPage kind="frames" title="All Frames" items={frameCatalog} language={language} />
}
