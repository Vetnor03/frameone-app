import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveStockBaselinePrice } from '@/app/lib/stocks/baseline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type FinnhubQuote = {
  c?: number
  d?: number
  dp?: number
  h?: number
  l?: number
  o?: number
  pc?: number
  t?: number
}

type SeriesPoint = {
  t: string
  p: number
}

type StockConfigItem = {
  id?: number | string
  symbol?: string
  name?: string
  assetType?: string
  purchasePrice?: number | string
  currency?: string
  chartRange?: string
}

type StockChartRange = 'day' | 'week' | 'month' | 'year'
type CandleFetchStatus = 'ok' | 'http_error' | 'no_data' | 'invalid_payload' | 'exception'
type YahooFetchStatus = 'ok' | 'http_error' | 'invalid_payload' | 'exception'
type YahooQuote = {
  price: number | null
  change: number | null
  changePercent: number | null
  previousClose: number | null
  open: number | null
  high: number | null
  low: number | null
  asOf: string | null
}
const SERIES_CAPS: Record<StockChartRange, number> = {
  day: 32,
  week: 40,
  month: 30,
  year: 60,
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function getBearerToken(req: Request) {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

function toNumber(v: unknown) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function clampPoints(points: SeriesPoint[], max: number) {
  if (points.length <= max) return points
  return points.slice(points.length - max)
}

function sanitizeSeries(points: SeriesPoint[]) {
  return points
    .filter((point) => {
      const hasIso = typeof point.t === 'string' && point.t.length > 0
      return hasIso && Number.isFinite(point.p)
    })
    .sort((a, b) => {
      const at = Date.parse(a.t)
      const bt = Date.parse(b.t)
      if (!Number.isFinite(at) && !Number.isFinite(bt)) return 0
      if (!Number.isFinite(at)) return 1
      if (!Number.isFinite(bt)) return -1
      return at - bt
    })
}

function toIsoOrNull(epochSeconds: unknown) {
  const ts = Number(epochSeconds)
  if (!Number.isFinite(ts) || ts <= 0) return null
  return new Date(ts * 1000).toISOString()
}

function normalizeChartRange(value: unknown): StockChartRange {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'week' || v === 'month' || v === 'year') return v
  return 'day'
}

function normalizeAssetType(value: unknown): 'stock' | 'etf' | 'fund' | 'unknown' {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'etf' || v === 'fund' || v === 'unknown') return v
  return 'stock'
}

function normalizeCurrency(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
}

async function fetchFinnhubQuote(symbol: string, apiKey: string): Promise<FinnhubQuote | null> {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`
  const resp = await fetch(url, { cache: 'no-store' })
  if (!resp.ok) return null
  const body = (await resp.json()) as FinnhubQuote
  return body && typeof body === 'object' ? body : null
}

async function fetchCandles(symbol: string, resolution: string, fromSec: number, toSec: number, apiKey: string) {
  const url =
    `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}` +
    `&resolution=${encodeURIComponent(resolution)}` +
    `&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(apiKey)}`

  const resp = await fetch(url, { cache: 'no-store' })
  if (!resp.ok) {
    const raw = await resp.text().catch(() => '')
    return {
      points: [] as SeriesPoint[],
      status: 'http_error' as CandleFetchStatus,
      reason: `HTTP ${resp.status} ${raw.slice(0, 200)}`,
    }
  }

  const raw = await resp.text().catch(() => '')
  let body: {
    s?: string
    c?: number[]
    t?: number[]
    error?: string
  }
  try {
    body = (raw ? JSON.parse(raw) : {}) as typeof body
  } catch {
    return {
      points: [] as SeriesPoint[],
      status: 'invalid_payload' as CandleFetchStatus,
      reason: raw.slice(0, 200),
    }
  }

  const apiStatus = String(body?.s ?? '').toLowerCase()
  if (apiStatus === 'no_data') {
    return {
      points: [] as SeriesPoint[],
      status: 'no_data' as CandleFetchStatus,
      reason: String(body?.error || 'Finnhub returned no_data'),
    }
  }

  if (apiStatus && apiStatus !== 'ok') {
    return {
      points: [] as SeriesPoint[],
      status: 'invalid_payload' as CandleFetchStatus,
      reason: `Unexpected status: ${apiStatus}`,
    }
  }

  const prices = Array.isArray(body?.c) ? body.c : []
  const ts = Array.isArray(body?.t) ? body.t : []
  const n = Math.min(prices.length, ts.length)

  const out: SeriesPoint[] = []
  for (let i = 0; i < n; i++) {
    const p = toNumber(prices[i])
    const t = toNumber(ts[i])
    if (p == null || t == null || t <= 0) continue
    out.push({ t: new Date(t * 1000).toISOString(), p })
  }

  return {
    points: out,
    status: 'ok' as CandleFetchStatus,
    reason: raw.slice(0, 200),
  }
}

function shouldFallbackToYahoo(status: CandleFetchStatus, reason: string) {
  if (status === 'no_data' || status === 'invalid_payload') return true
  return status === 'http_error' && /HTTP\s+403/i.test(reason)
}

function yahooRangeParams(chartRange: StockChartRange) {
  if (chartRange === 'week') return { range: '5d', interval: '1h', limit: 40 }
  if (chartRange === 'month') return { range: '1mo', interval: '1d', limit: 30 }
  if (chartRange === 'year') return { range: '1y', interval: '1wk', limit: 60 }
  return { range: '1d', interval: '30m', limit: 32 }
}

async function fetchYahooCandles(symbol: string, chartRange: StockChartRange) {
  const primaryParams = yahooRangeParams(chartRange)
  const paramsCandidates =
    chartRange === 'week'
      ? [
          primaryParams,
          { range: '7d', interval: '1h', limit: primaryParams.limit },
        ]
      : [primaryParams]

  let lastFailure: { status: YahooFetchStatus; reason: string } = { status: 'invalid_payload', reason: 'No attempts made' }

  for (const params of paramsCandidates) {
    const url =
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?range=${encodeURIComponent(params.range)}&interval=${encodeURIComponent(params.interval)}`

    const resp = await fetch(url, {
      cache: 'no-store',
      headers: { 'user-agent': 'Mozilla/5.0' },
    })

    const raw = await resp.text().catch(() => '')
    if (!resp.ok) {
      lastFailure = {
        status: 'http_error' as YahooFetchStatus,
        reason: `HTTP ${resp.status} ${raw.slice(0, 200)}`,
      }
      continue
    }

    let body: {
      chart?: {
        result?: Array<{
          timestamp?: number[]
          indicators?: { quote?: Array<{ close?: Array<number | null> }> }
        }>
      }
    }
    try {
      body = (raw ? JSON.parse(raw) : {}) as typeof body
    } catch {
      lastFailure = {
        status: 'invalid_payload' as YahooFetchStatus,
        reason: raw.slice(0, 200),
      }
      continue
    }

    const result = Array.isArray(body?.chart?.result) ? body.chart?.result?.[0] : null
    const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : []
    const closes = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators?.quote?.[0]?.close ?? [] : []
    const n = Math.min(timestamps.length, closes.length)
    const points: SeriesPoint[] = []
    for (let i = 0; i < n; i++) {
      const t = toNumber(timestamps[i])
      const p = toNumber(closes[i])
      if (t == null || p == null || t <= 0) continue
      points.push({ t: new Date(t * 1000).toISOString(), p })
    }

    const sanitized = clampPoints(sanitizeSeries(points), params.limit)
    if (sanitized.length > 0) {
      return {
        points: sanitized,
        status: 'ok' as YahooFetchStatus,
        reason: raw.slice(0, 200),
      }
    }

    lastFailure = {
      status: 'invalid_payload' as YahooFetchStatus,
      reason: raw.slice(0, 200),
    }
  }

  return {
    points: [] as SeriesPoint[],
    status: lastFailure.status,
    reason: lastFailure.reason,
  }
}

async function fetchYahooQuote(symbol: string): Promise<YahooQuote | null> {
  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    '?range=1d&interval=1m'
  const resp = await fetch(url, {
    cache: 'no-store',
    headers: { 'user-agent': 'Mozilla/5.0' },
  })
  if (!resp.ok) return null
  const raw = await resp.text().catch(() => '')
  let body: {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number
          chartPreviousClose?: number
          previousClose?: number
          regularMarketTime?: number
        }
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>
            high?: Array<number | null>
            low?: Array<number | null>
            close?: Array<number | null>
          }>
        }
      }>
    }
  }
  try {
    body = (raw ? JSON.parse(raw) : {}) as typeof body
  } catch {
    return null
  }
  const result = Array.isArray(body?.chart?.result) ? body.chart?.result?.[0] : null
  const meta = result?.meta
  const quote = result?.indicators?.quote?.[0]
  const closes = Array.isArray(quote?.close) ? quote?.close ?? [] : []
  const opens = Array.isArray(quote?.open) ? quote?.open ?? [] : []
  const highs = Array.isArray(quote?.high) ? quote?.high ?? [] : []
  const lows = Array.isArray(quote?.low) ? quote?.low ?? [] : []
  const lastFinite = (arr: Array<number | null>) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      const n = toNumber(arr[i])
      if (n != null) return n
    }
    return null
  }
  const price = toNumber(meta?.regularMarketPrice) ?? lastFinite(closes)
  const previousClose = toNumber(meta?.chartPreviousClose) ?? toNumber(meta?.previousClose)
  const change = price != null && previousClose != null ? price - previousClose : null
  const changePercent = change != null && previousClose ? (change / previousClose) * 100 : null
  return {
    price,
    change,
    changePercent,
    previousClose,
    open: lastFinite(opens),
    high: lastFinite(highs),
    low: lastFinite(lows),
    asOf: toIsoOrNull(meta?.regularMarketTime),
  }
}

function makeSignature(symbol: string, price: number | null, change: number | null, changePercent: number | null) {
  const p = price == null ? '' : String(price)
  const c = change == null ? '' : String(change)
  const cp = changePercent == null ? '' : String(changePercent)
  return `${symbol}:${p}:${c}:${cp}`
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const device_id = String(url.searchParams.get('device_id') || '').trim()
    const rawId = Number(url.searchParams.get('id'))

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    if (!Number.isFinite(rawId) || rawId < 1 || rawId > 255) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const token = getBearerToken(req)
    if (!token) {
      return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('device_id, device_token')
      .eq('device_id', device_id)
      .maybeSingle()

    if (deviceError || !device || device.device_token !== token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('device_settings')
      .select('settings_json')
      .eq('device_id', device_id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const settings = asRecord(data?.settings_json) ?? {}
    const modules = asRecord(settings.modules) ?? {}
    const rawStocks = modules.stocks
    const stocksList: StockConfigItem[] = Array.isArray(rawStocks) ? (rawStocks as StockConfigItem[]) : []

    const cfg = stocksList.find((item) => Number(item?.id) === rawId)
    if (!cfg) {
      return NextResponse.json({ error: 'Stock config not found' }, { status: 404 })
    }

    const symbol = String(cfg.symbol || '').trim().toUpperCase()
    const name = String(cfg.name || '').trim()
    const chartRange = normalizeChartRange(cfg.chartRange)
    const assetType = normalizeAssetType(cfg.assetType)
    const purchasePriceRaw = toNumber(cfg.purchasePrice)
    // Privacy: intentionally only store buy price and percent performance, never amount invested/position size.
    const purchasePrice = purchasePriceRaw != null && purchasePriceRaw > 0 ? purchasePriceRaw : null

    if (!symbol && !name) {
      return NextResponse.json({ error: 'Stock config missing symbol/name' }, { status: 404 })
    }

    const apiKey = process.env.FINNHUB_API_KEY

    const nowSec = Math.floor(Date.now() / 1000)
    const resolvedSymbol = symbol || name

    const quoteRaw = apiKey ? await fetchFinnhubQuote(resolvedSymbol, apiKey) : null
    const yahooQuote = quoteRaw ? null : await fetchYahooQuote(resolvedSymbol)

    const currency = normalizeCurrency(cfg.currency) || 'USD'

    const price = toNumber(quoteRaw?.c) ?? yahooQuote?.price ?? null
    const change = toNumber(quoteRaw?.d) ?? yahooQuote?.change ?? null
    const changePercent = toNumber(quoteRaw?.dp) ?? yahooQuote?.changePercent ?? null
    const previousClose = toNumber(quoteRaw?.pc) ?? yahooQuote?.previousClose ?? null
    const open = toNumber(quoteRaw?.o) ?? yahooQuote?.open ?? null
    const high = toNumber(quoteRaw?.h) ?? yahooQuote?.high ?? null
    const low = toNumber(quoteRaw?.l) ?? yahooQuote?.low ?? null
    const asOf = toIsoOrNull(quoteRaw?.t) ?? yahooQuote?.asOf ?? null

    const candleStatus: Record<StockChartRange, { status: CandleFetchStatus; reason: string }> = {
      day: { status: 'exception', reason: 'Not requested' },
      week: { status: 'exception', reason: 'Not requested' },
      month: { status: 'exception', reason: 'Not requested' },
      year: { status: 'exception', reason: 'Not requested' },
    }

    let day: SeriesPoint[] = []
    let hasSyntheticDaySeries = false
    try {
      if (!apiKey) throw new Error('Missing FINNHUB_API_KEY')
      const result = await fetchCandles(resolvedSymbol, '30', nowSec - 36 * 3600, nowSec, apiKey)
      day = clampPoints(sanitizeSeries(result.points), SERIES_CAPS.day)
      candleStatus.day = { status: result.status, reason: result.reason }
    } catch (error: unknown) {
      day = []
      candleStatus.day = {
        status: 'exception',
        reason: error instanceof Error ? error.message : 'Unknown error',
      }
    }

    let week: SeriesPoint[] = []
    try {
      if (!apiKey) throw new Error('Missing FINNHUB_API_KEY')
      const result = await fetchCandles(resolvedSymbol, '60', nowSec - 7 * 24 * 3600, nowSec, apiKey)
      week = clampPoints(sanitizeSeries(result.points), SERIES_CAPS.week)
      candleStatus.week = { status: result.status, reason: result.reason }
    } catch (error: unknown) {
      week = []
      candleStatus.week = {
        status: 'exception',
        reason: error instanceof Error ? error.message : 'Unknown error',
      }
    }

    let month: SeriesPoint[] = []
    try {
      if (!apiKey) throw new Error('Missing FINNHUB_API_KEY')
      const result = await fetchCandles(resolvedSymbol, 'D', nowSec - 45 * 24 * 3600, nowSec, apiKey)
      month = clampPoints(sanitizeSeries(result.points), SERIES_CAPS.month)
      candleStatus.month = { status: result.status, reason: result.reason }
    } catch (error: unknown) {
      month = []
      candleStatus.month = {
        status: 'exception',
        reason: error instanceof Error ? error.message : 'Unknown error',
      }
    }

    let year: SeriesPoint[] = []
    try {
      if (!apiKey) throw new Error('Missing FINNHUB_API_KEY')
      const result = await fetchCandles(resolvedSymbol, 'W', nowSec - 500 * 24 * 3600, nowSec, apiKey)
      year = clampPoints(sanitizeSeries(result.points), SERIES_CAPS.year)
      candleStatus.year = { status: result.status, reason: result.reason }
    } catch (error: unknown) {
      year = []
      candleStatus.year = {
        status: 'exception',
        reason: error instanceof Error ? error.message : 'Unknown error',
      }
    }

    const seriesByRange: Record<StockChartRange, SeriesPoint[]> = { day, week, month, year }
    let selectedSeries = seriesByRange[chartRange] || []
    const selectedStatus = candleStatus[chartRange]
    const selectedSeriesFailed = selectedStatus.status !== 'ok'

    if (selectedSeriesFailed && selectedSeries.length === 0 && shouldFallbackToYahoo(selectedStatus.status, selectedStatus.reason)) {
      try {
        const yahoo = await fetchYahooCandles(resolvedSymbol, chartRange)
        if (yahoo.status === 'ok' && yahoo.points.length > 0) {
          seriesByRange[chartRange] = yahoo.points
          if (chartRange === 'day') day = yahoo.points
          selectedSeries = yahoo.points
        }
      } catch (error: unknown) {
        void error
      }
    }

    if (selectedSeriesFailed && selectedSeries.length === 0 && price != null && previousClose != null) {
      selectedSeries = [
        { t: new Date((nowSec - 24 * 3600) * 1000).toISOString(), p: previousClose },
        { t: new Date(nowSec * 1000).toISOString(), p: price },
      ]
      if (chartRange === 'day') {
        seriesByRange.day = selectedSeries
        hasSyntheticDaySeries = true
      }
    }


    const currentPrice = price
    const hasValidPreviousClose = previousClose != null && previousClose > 0
    const hasValidCurrentPrice = currentPrice != null && Number.isFinite(currentPrice)
    const dayChangePct =
      hasValidPreviousClose && hasValidCurrentPrice
        ? ((currentPrice - previousClose) / previousClose) * 100
        : changePercent
    const rangeChangePct =
      selectedSeries.length >= 2 && selectedSeries[0]?.p != null && selectedSeries[selectedSeries.length - 1]?.p != null && selectedSeries[0].p > 0
        ? ((selectedSeries[selectedSeries.length - 1].p - selectedSeries[0].p) / selectedSeries[0].p) * 100
        : null
    const returnSincePurchasePct =
      purchasePrice != null && currentPrice != null
        ? ((currentPrice - purchasePrice) / purchasePrice) * 100
        : null
    const selectedSeriesFirstPrice = selectedSeries.length > 0 ? selectedSeries[0]?.p ?? null : null
    const selectedRangeReturnPct =
      hasValidCurrentPrice && chartRange === 'day'
        ? dayChangePct
        : hasValidCurrentPrice && selectedSeriesFirstPrice != null && selectedSeriesFirstPrice > 0
          ? ((currentPrice - selectedSeriesFirstPrice) / selectedSeriesFirstPrice) * 100
          : rangeChangePct
    const displayReturnPct = returnSincePurchasePct ?? selectedRangeReturnPct

    const firstIntradayPrice = !hasSyntheticDaySeries && seriesByRange.day.length > 0 ? seriesByRange.day[0]?.p ?? null : null
    const { baselinePrice, baselineSource } = resolveStockBaselinePrice({
      openPrice: open,
      firstIntradayPrice,
      previousClose,
    })

    console.info('/api/device/stocks baseline', {
      ticker: resolvedSymbol,
      currentPrice,
      openPrice: open,
      previousClose,
      baselinePrice,
      baselineSource,
    })

    const response = {
      symbol: resolvedSymbol,
      name: name || resolvedSymbol,
      assetType,
      chartRange,
      currency,
      ...(purchasePrice != null ? { purchasePrice } : {}),
      ...(returnSincePurchasePct != null ? { personalChangePercent: returnSincePurchasePct } : {}),
      ...(rangeChangePct != null ? { rangeChangePercent: rangeChangePct } : {}),
      ...(displayReturnPct != null ? { displayReturnPercent: displayReturnPct } : {}),
      ...(baselinePrice != null && Number.isFinite(baselinePrice) ? { baselinePrice } : {}),
      ...(baselineSource ? { baselineSource } : {}),
      quote: {
        price: currentPrice,
        change,
        changePercent: dayChangePct,
        previousClose,
        open,
        high,
        low,
        asOf,
      },
      series: seriesByRange,
      selectedSeries,
      signature: makeSignature(resolvedSymbol, price, change, changePercent),
    }

    return NextResponse.json(response)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
