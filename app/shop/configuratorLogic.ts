export function optionUpgrade(selectedPrice: number | null, optionPrices: Array<number | null>) {
  if (selectedPrice === null) return 0

  const pricedOptions = optionPrices.filter((price): price is number => price !== null)
  return selectedPrice - Math.min(...pricedOptions)
}

export function configurationTotal(basePrice: number, frameUpgrade: number, matteUpgrade: number) {
  return basePrice + frameUpgrade + matteUpgrade
}
