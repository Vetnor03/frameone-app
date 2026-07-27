import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ProductDetailPage from '../../ProductDetailPage'
import { frameCatalog } from '../../catalogData'

type PageProps = { params: Promise<{ id: string }> }

export function generateStaticParams() {
  return frameCatalog.map((item) => ({ id: item.id }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const item = frameCatalog.find((candidate) => candidate.id === id)
  return item ? { title: `${item.name} Frame | RE:MIND Shop`, description: item.subtitle } : {}
}

export default async function FrameDetailRoute({ params }: PageProps) {
  const { id } = await params
  const item = frameCatalog.find((candidate) => candidate.id === id)
  if (!item) notFound()
  return <ProductDetailPage kind="frames" item={item} />
}
