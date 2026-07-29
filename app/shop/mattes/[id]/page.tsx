import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ProductDetailPage from '../../ProductDetailPage'
import { matteCatalog } from '../../catalogData'
import { shopMetadata } from '../../seo'
import { pickShopLocale } from '../../productData'

type PageProps = { params: Promise<{ id: string }>; searchParams?: Promise<{ lang?: string }> }

export function generateStaticParams() {
  return matteCatalog.map((item) => ({ id: item.id }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const item = matteCatalog.find((candidate) => candidate.id === id)
  return item ? shopMetadata({
    title: `${item.name} Matte | RE:MIND`,
    description: `${item.subtitle}. An interchangeable matte designed for RE:MIND.`,
    path: `/shop/mattes/${item.id}`,
  }) : {}
}

export default async function MatteDetailRoute({ params, searchParams }: PageProps) {
  const { id } = await params
  const item = matteCatalog.find((candidate) => candidate.id === id)
  if (!item) notFound()
  return <ProductDetailPage kind="mattes" item={item} language={pickShopLocale((await searchParams)?.lang)} />
}
