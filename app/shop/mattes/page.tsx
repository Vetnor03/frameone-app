import type { Metadata } from 'next'
import CatalogPage from '../CatalogPage'
import { matteCatalog } from '../catalogData'

export const metadata: Metadata = { title: 'Mattes | RE:MIND Shop', description: 'Explore all RE:MIND matte options.' }

export default function MattesPage() {
  return <CatalogPage kind="mattes" title="All Mattes" items={matteCatalog} />
}
