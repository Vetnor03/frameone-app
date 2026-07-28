import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ProductDetailPage from '../../ProductDetailPage'
import { frameCatalog } from '../../catalogData'
import { shopMetadata } from '../../seo'

type PageProps = { params: Promise<{ id: string }> }

export function generateStaticParams() {
  return frameCatalog.map((item) => ({ id: item.id }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const item = frameCatalog.find((candidate) => candidate.id === id)
  return item ? shopMetadata({
    title: `${item.name} Frame | RE:MIND`,
    description: `${item.subtitle}. An interchangeable frame designed for RE:MIND.`,
    path: `/shop/frames/${item.id}`,
  }) : {}
}

export default async function FrameDetailRoute({ params }: PageProps) {
  const { id } = await params
  const item = frameCatalog.find((candidate) => candidate.id === id)
  if (!item) notFound()
  return <ProductDetailPage kind="frames" item={item} />
}
