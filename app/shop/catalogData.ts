import type { CatalogItem } from './CatalogPage'
import { frameAvailability, matteAvailability, shopFrames, shopMattes } from './productData'

function productPrice(items: Array<{ id: string; price: number | null }>, id: string) {
  const price = items.find((item) => item.id === id)?.price
  if (price == null) throw new Error(`Catalog product ${id} must have a purchasable price`)
  return price
}

export const frameCatalog: CatalogItem[] = [
  ['Midnight Black', 'Matte aluminum', ['#111214', '#d5d5d5'], '/shop/frames/midnight-black.png'],
  ['Natural Oak', 'Real oak', ['#bb8d5f', '#d8be9f'], '/shop/frames/natural-oak.png'],
  ['Walnut Wood', 'Real walnut', ['#6a4633', '#8a624a'], '/shop/frames/walnut-wood.png'],
  ['Cloud White', 'Matte aluminum', ['#f0f0ef', '#cfcfcf'], '/shop/frames/cloud-white.png'],
  ['Brushed Silver', 'Brushed aluminum', ['#aeb1b2', '#e2e3e3']],
  ['Charcoal Grey', 'Matte aluminum', ['#3d4042', '#777b7e']],
  ['Smoked Oak', 'Real oak', ['#604b3b', '#9a7a5e']],
  ['Honey Oak', 'Real oak', ['#b77c3d', '#e0b77e']],
  ['Espresso Wood', 'Real ash', ['#30251f', '#75523d']],
  ['Sandstone', 'Soft-touch finish', ['#c7b7a1', '#e5dbcd']],
  ['Sage Green', 'Powder-coated aluminum', ['#788372', '#bac2b4']],
  ['Deep Navy', 'Powder-coated aluminum', ['#24313d', '#647789']],
  ['Terracotta', 'Powder-coated aluminum', ['#9c5943', '#d7a18e']],
  ['Limited Birch', 'Real birch', ['#cfaa78', '#edcf9e']],
].map(([name, subtitle, colors, imageSrc]) => {
  const id = String(name).toLowerCase().replaceAll(' ', '-').replaceAll('/', '-')
  return { id, name, subtitle, price: productPrice(shopFrames, id), colors, imageSrc, availability: frameAvailability(id) } as CatalogItem
})

export const matteCatalog: CatalogItem[] = [
  ['Classic White', 'Crisp gallery white', ['#f6f4ef', '#d9d5cf']],
  ['Soft Black', 'Deep low-glare black', ['#242424', '#626262']],
  ['Warm Beige', 'Soft neutral tone', ['#d8c7b4', '#eee4d8']],
  ['Cocoa Brown', 'Rich earthy tone', ['#62483b', '#a98773']],
  ['Sage Green', 'Muted botanical green', ['#87927e', '#c2cbbd']],
  ['White / Black', 'Double-layer contrast', ['#f4f2ed', '#282828']],
  ['Black / White', 'Double-layer contrast', ['#252525', '#f0eee9']],
  ['Mist Grey', 'Cool contemporary grey', ['#b9bdbe', '#e0e2e1']],
  ['Dusty Blue', 'Calm muted blue', ['#7f929f', '#c6d0d5']],
  ['Blush Pink', 'Subtle warm blush', ['#cdaaa4', '#ead5d0']],
  ['Ochre', 'Warm golden accent', ['#b8863e', '#dec38a']],
  ['Forest Green', 'Deep natural green', ['#344b3d', '#778c7d']],
  ['Burgundy', 'Rich wine red', ['#633b42', '#a7797e']],
  ['Natural Linen', 'Textured linen look', ['#cbbba2', '#e8dece']],
].map(([name, subtitle, colors]) => {
  const id = String(name).toLowerCase().replaceAll(' ', '-').replaceAll('/', '-')
  return { id, name, subtitle, price: productPrice(shopMattes, id), colors, availability: matteAvailability(id) } as CatalogItem
})
