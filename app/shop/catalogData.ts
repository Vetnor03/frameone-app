import type { CatalogItem } from './CatalogPage'
import { frameAvailability, matteAvailability } from './productData'

export const frameCatalog: CatalogItem[] = [
  ['Midnight Black', 'Matte aluminum', 349, ['#111214', '#d5d5d5'], '/shop/frames/midnight-black.png'],
  ['Natural Oak', 'Real oak', 399, ['#bb8d5f', '#d8be9f'], '/shop/frames/natural-oak.png'],
  ['Walnut Wood', 'Real walnut', 399, ['#6a4633', '#8a624a'], '/shop/frames/walnut-wood.png'],
  ['Cloud White', 'Matte aluminum', 349, ['#f0f0ef', '#cfcfcf'], '/shop/frames/cloud-white.png'],
  ['Brushed Silver', 'Brushed aluminum', 369, ['#aeb1b2', '#e2e3e3']],
  ['Charcoal Grey', 'Matte aluminum', 349, ['#3d4042', '#777b7e']],
  ['Smoked Oak', 'Real oak', 419, ['#604b3b', '#9a7a5e']],
  ['Honey Oak', 'Real oak', 399, ['#b77c3d', '#e0b77e']],
  ['Espresso Wood', 'Real ash', 419, ['#30251f', '#75523d']],
  ['Sandstone', 'Soft-touch finish', 369, ['#c7b7a1', '#e5dbcd']],
  ['Sage Green', 'Powder-coated aluminum', 369, ['#788372', '#bac2b4']],
  ['Deep Navy', 'Powder-coated aluminum', 369, ['#24313d', '#647789']],
  ['Terracotta', 'Powder-coated aluminum', 369, ['#9c5943', '#d7a18e']],
  ['Limited Birch', 'Real birch', 429, ['#cfaa78', '#edcf9e']],
].map(([name, subtitle, price, colors, imageSrc]) => ({
  id: String(name).toLowerCase().replaceAll(' ', '-').replaceAll('/', '-'),
  name, subtitle, price, colors, imageSrc, availability: frameAvailability(String(name).toLowerCase().replaceAll(' ', '-').replaceAll('/', '-')),
} as CatalogItem))

export const matteCatalog: CatalogItem[] = [
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
].map(([name, subtitle, price, colors]) => {
  const id = String(name).toLowerCase().replaceAll(' ', '-').replaceAll('/', '-')
  return { id, name, subtitle, price, colors, availability: matteAvailability(id) } as CatalogItem
})
