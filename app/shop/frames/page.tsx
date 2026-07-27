import type { Metadata } from 'next'
import CatalogPage from '../CatalogPage'
import { frameCatalog } from '../catalogData'

export const metadata: Metadata = { title: 'Frames | RE:MIND Shop', description: 'Explore all RE:MIND frame finishes.' }

export default function FramesPage() {
  return <CatalogPage kind="frames" title="All Frames" intro="Explore 14 interchangeable finishes, designed to fit your room and change in seconds." items={frameCatalog} />
}
