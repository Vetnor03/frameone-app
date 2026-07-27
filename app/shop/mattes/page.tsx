import type { Metadata } from 'next'
import CatalogPage, { type CatalogItem } from '../CatalogPage'

export const metadata: Metadata = { title: 'Mattes | RE:MIND Shop', description: 'Explore all RE:MIND matte options.' }

const mattes: CatalogItem[] = [
  ['Classic White', 'Crisp gallery white', 149, ['#f6f4ef', '#d9d5cf']],
  ['Soft Black', 'Deep low-glare black', 149, ['#242424', '#626262']],
  ['Warm Beige', 'Soft neutral tone', 149, ['#d8c7b4', '#eee4d8']],
  ['Cocoa Brown', 'Rich earthy tone', 149, ['#62483b', '#a98773']],
  ['Sage Green', 'Muted botanical green', 159, ['#87927e', '#c2cbbd']],
  ['White / Black', 'Double-layer contrast', 179, ['#f4f2ed', '#282828']],
  ['Black / White', 'Double-layer contrast', 179, ['#252525', '#f0eee9']],
  ['Mist Grey', 'Cool contemporary grey', 149, ['#b9bdbe', '#e0e2e1']],
  ['Dusty Blue', 'Calm muted blue', 159, ['#7f929f', '#c6d0d5']],
  ['Blush Pink', 'Subtle warm blush', 159, ['#cdaaa4', '#ead5d0']],
  ['Ochre', 'Warm golden accent', 159, ['#b8863e', '#dec38a']],
  ['Forest Green', 'Deep natural green', 159, ['#344b3d', '#778c7d']],
  ['Burgundy', 'Rich wine red', 159, ['#633b42', '#a7797e']],
  ['Natural Linen', 'Textured linen look', 179, ['#cbbba2', '#e8dece']],
].map(([name, subtitle, price, colors]) => ({ name, subtitle, price, colors } as CatalogItem))

export default function MattesPage() {
  return <CatalogPage kind="mattes" title="All Mattes" intro="Choose from 14 tones and layered combinations to change the feel without changing the frame." items={mattes} />
}
