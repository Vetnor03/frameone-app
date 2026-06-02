import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveStockBaselinePrice } from '../app/lib/stocks/baseline.ts'

test('day range dotted baseline uses opening price per stock for both stocks in the module', () => {
  const firstStock = resolveStockBaselinePrice({
    openPrice: 212.34,
    firstIntradayPrice: 211.01,
    previousClose: 209.87,
  })
  const secondStock = resolveStockBaselinePrice({
    openPrice: 148.25,
    firstIntradayPrice: 147.5,
    previousClose: 146.9,
  })

  assert.deepEqual(firstStock, { baselinePrice: 212.34, baselineSource: 'open' })
  assert.deepEqual(secondStock, { baselinePrice: 148.25, baselineSource: 'open' })
})

test('stock dotted baseline falls back to first intraday point, then previous close', () => {
  assert.deepEqual(
    resolveStockBaselinePrice({
      openPrice: null,
      firstIntradayPrice: 99.5,
      previousClose: 98,
    }),
    { baselinePrice: 99.5, baselineSource: 'first_intraday' },
  )

  assert.deepEqual(
    resolveStockBaselinePrice({
      openPrice: null,
      firstIntradayPrice: null,
      previousClose: 98,
    }),
    { baselinePrice: 98, baselineSource: 'previous_close' },
  )
})
