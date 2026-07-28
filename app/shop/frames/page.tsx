import type { Metadata } from 'next'
import CatalogPage from '../CatalogPage'
import { frameCatalog } from '../catalogData'
import { shopMetadata } from '../seo'

export const metadata: Metadata = shopMetadata({ title: 'Frames | RE:MIND', description: 'Explore interchangeable RE:MIND frame finishes, from matte aluminum to real wood.', path: '/shop/frames' })

export default function FramesPage() {
  return <CatalogPage kind="frames" title="All Frames" items={frameCatalog} />
}
