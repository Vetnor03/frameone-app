import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ProductDetailPage from '../../ProductDetailPage'
import { matteCatalog } from '../../catalogData'

type PageProps = { params: Promise<{ id: string }> }

export function generateStaticParams() {
  return matteCatalog.map((item) => ({ id: item.id }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const item = matteCatalog.find((candidate) => candidate.id === id)
  return item ? { title: `${item.name} Matte | RE:MIND Shop`, description: item.subtitle } : {}
}

export default async function MatteDetailRoute({ params }: PageProps) {
  const { id } = await params
  const item = matteCatalog.find((candidate) => candidate.id === id)
  if (!item) notFound()
  return <ProductDetailPage kind="mattes" item={item} />
}
