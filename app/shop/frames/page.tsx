import type { Metadata } from 'next'
import CatalogPage, { type CatalogItem } from '../CatalogPage'

export const metadata: Metadata = { title: 'Frames | RE:MIND Shop', description: 'Explore all RE:MIND frame finishes.' }

const frames: CatalogItem[] = [
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
  name, subtitle, price, colors, imageSrc,
} as CatalogItem))

export default function FramesPage() {
  return <CatalogPage kind="frames" title="All Frames" intro="Explore 14 interchangeable finishes, designed to fit your room and change in seconds." items={frames} />
}
