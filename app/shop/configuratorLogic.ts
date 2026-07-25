import type { ShopFrame, ShopMatte } from './productData'

export function combinationIndex(frameIndex: number, matteIndex: number, matteCount: number) {
  return frameIndex * matteCount + matteIndex
}

export function cycleCombination(current: number, direction: 1 | -1, total: number) {
  return (current + direction + total) % total
}

export function combinationAt(index: number, frames: ShopFrame[], mattes: ShopMatte[]) {
  return {
    frame: frames[Math.floor(index / mattes.length)],
    matte: mattes[index % mattes.length],
  }
}

export function optionUpgrade(selectedPrice: number | null, optionPrices: Array<number | null>) {
  if (selectedPrice === null) return 0

  const pricedOptions = optionPrices.filter((price): price is number => price !== null)
  return selectedPrice - Math.min(...pricedOptions)
}

export function configurationTotal(basePrice: number, frameUpgrade: number, matteUpgrade: number) {
  return basePrice + frameUpgrade + matteUpgrade
}
