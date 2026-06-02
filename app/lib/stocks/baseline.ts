export type StockBaselineSource = 'open' | 'first_intraday' | 'previous_close'

export type StockBaselineInput = {
  openPrice?: number | null
  firstIntradayPrice?: number | null
  previousClose?: number | null
}

export type StockBaselineResult = {
  baselinePrice: number | null
  baselineSource: StockBaselineSource | null
}

function usablePrice(value: number | null | undefined) {
  if (typeof value !== 'number') return null
  return Number.isFinite(value) && value > 0 ? value : null
}

export function resolveStockBaselinePrice(input: StockBaselineInput): StockBaselineResult {
  const openPrice = usablePrice(input.openPrice)
  if (openPrice != null) {
    return { baselinePrice: openPrice, baselineSource: 'open' }
  }

  const firstIntradayPrice = usablePrice(input.firstIntradayPrice)
  if (firstIntradayPrice != null) {
    return { baselinePrice: firstIntradayPrice, baselineSource: 'first_intraday' }
  }

  const previousClose = usablePrice(input.previousClose)
  if (previousClose != null) {
    return { baselinePrice: previousClose, baselineSource: 'previous_close' }
  }

  return { baselinePrice: null, baselineSource: null }
}
