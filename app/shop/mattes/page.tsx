import type { Metadata } from 'next'
import CatalogPage from '../CatalogPage'
import { matteCatalog } from '../catalogData'
import { shopMetadata } from '../seo'
import { pickShopLocale } from '../productData'

export const metadata: Metadata = shopMetadata({ title: 'Mattes | RE:MIND', description: 'Explore interchangeable matte colors designed to make your RE:MIND feel at home.', path: '/shop/mattes' })

export default async function MattesPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const language = pickShopLocale((await searchParams)?.lang)
  return <CatalogPage kind="mattes" title="All Mattes" items={matteCatalog} language={language} />
}
