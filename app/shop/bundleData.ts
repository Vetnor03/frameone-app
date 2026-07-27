import { remindProduct, shopFrames, shopMattes } from './productData'

export type ShopBundle = {
  id: string
  name: string
  eyebrow: string
  description: string
  deviceCount: 0 | 1
  frameCount: number
  matteCount: number
  price: number
  colors: [string, string, string]
}

export const shopBundles: ShopBundle[] = [
  { id: 'complete-home', name: 'The Complete Home', eyebrow: 'Our best value', description: 'One complete RE:MIND plus an extra frame and matte, ready to change with your room or season.', deviceCount: 1, frameCount: 2, matteCount: 2, price: 2499, colors: ['#6d4935', '#e6e2d9', '#87927e'] },
  { id: 'frame-pair', name: 'The Frame Pair', eyebrow: 'Two fresh looks', description: 'Two interchangeable frames and one matte for an existing RE:MIND display.', deviceCount: 0, frameCount: 2, matteCount: 1, price: 749, colors: ['#202120', '#c69762', '#f1eee7'] },
  { id: 'style-library', name: 'The Style Library', eyebrow: 'Maximum flexibility', description: 'Three frames and three mattes to build a flexible collection around the RE:MIND you own.', deviceCount: 0, frameCount: 3, matteCount: 3, price: 1399, colors: ['#304238', '#a9744a', '#c6b8a5'] },
]

const pricedFrames = shopFrames.filter((item): item is typeof item & { price: number } => item.price !== null && !item.id.startsWith('custom-'))
const pricedMattes = shopMattes.filter((item): item is typeof item & { price: number } => item.price !== null && !item.id.startsWith('custom-'))

export function bundleRegularPrice(bundle: ShopBundle, framePrices?: number[], mattePrices?: number[]) {
  const frames = framePrices ?? Array.from({ length: bundle.frameCount }, () => Math.min(...pricedFrames.map(({ price }) => price)))
  const mattes = mattePrices ?? Array.from({ length: bundle.matteCount }, () => Math.min(...pricedMattes.map(({ price }) => price)))

  if (!bundle.deviceCount) return frames.reduce((sum, price) => sum + price, 0) + mattes.reduce((sum, price) => sum + price, 0)

  // A configured RE:MIND already includes the first frame and matte. Their price only
  // adds an upgrade above the least-expensive option; remaining pieces are accessories.
  const baseFramePrice = Math.min(...pricedFrames.map(({ price }) => price))
  const baseMattePrice = Math.min(...pricedMattes.map(({ price }) => price))
  return remindProduct.price
    + Math.max(0, (frames[0] ?? baseFramePrice) - baseFramePrice)
    + Math.max(0, (mattes[0] ?? baseMattePrice) - baseMattePrice)
    + frames.slice(1).reduce((sum, price) => sum + price, 0)
    + mattes.slice(1).reduce((sum, price) => sum + price, 0)
}

export function bundleSavings(bundle: ShopBundle, framePrices?: number[], mattePrices?: number[]) {
  return bundleRegularPrice(bundle, framePrices, mattePrices) - bundle.price
}
