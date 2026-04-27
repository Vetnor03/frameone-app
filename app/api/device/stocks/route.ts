import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

type FinnhubProfile = {
  currency?: string
}

type SeriesPoint = {
  t: string
  p: number
}

type StockConfigItem = {
  id?: number | string
  symbol?: string
  name?: string
  chartRange?: string
}

type StockChartRange = 'day' | 'week' | 'month' | 'year'
type CandleFetchStatus = 'ok' | 'http_error' | 'no_data' | 'invalid_payload' | 'exception'
type CandleFetchResult = {
  points: SeriesPoint[]
  status: CandleFetchStatus
  reason: string
  httpStatus: number | null
  responseBody: string
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

function inferCurrencyFromSymbol(symbol: string) {
  const s = symbol.toUpperCase()
  if (s.endsWith('.OL')) return 'NOK'
  return ''
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

async function fetchFinnhubQuote(symbol: string, apiKey: string): Promise<FinnhubQuote | null> {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`
  const resp = await fetch(url, { cache: 'no-store' })
  if (!resp.ok) return null
  const body = (await resp.json()) as FinnhubQuote
  return body && typeof body === 'object' ? body : null
}

async function fetchFinnhubCurrency(symbol: string, apiKey: string): Promise<string> {
  const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`
  const resp = await fetch(url, { cache: 'no-store' })
  if (!resp.ok) return ''
  const body = (await resp.json()) as FinnhubProfile
  return String(body?.currency || '').trim().toUpperCase()
}

async function fetchCandles(symbol: string, resolution: string, fromSec: number, toSec: number, apiKey: string) {
  const endpoint = 'https://finnhub.io/api/v1/stock/candle'
  const params = new URLSearchParams({
    symbol,
    resolution,
    from: String(fromSec),
    to: String(toSec),
    token: apiKey,
  })
  const url = `${endpoint}?${params.toString()}`
  const hasToken = Boolean(apiKey && apiKey.trim())

  const resp = await fetch(url, { cache: 'no-store' })
  const rawBody = await resp.text()

  if (!resp.ok) {
    const result: CandleFetchResult = {
      points: [] as SeriesPoint[],
      status: 'http_error' as CandleFetchStatus,
      reason: `HTTP ${resp.status}`,
      httpStatus: resp.status,
      responseBody: rawBody,
    }

    console.warn(
      '[device/stocks] candle fetch failed',
      JSON.stringify({
        symbol,
        resolution,
        from: fromSec,
        to: toSec,
        hasToken,
        httpStatus: resp.status,
        finnhubBody: rawBody,
      })
    )

    return result
  }

  const body = (rawBody ? JSON.parse(rawBody) : {}) as {
    s?: string
    c?: number[]
    t?: number[]
    error?: string
  }

  const apiStatus = String(body?.s ?? '').toLowerCase()
  if (apiStatus === 'no_data') {
    return {
      points: [] as SeriesPoint[],
      status: 'no_data' as CandleFetchStatus,
      reason: String(body?.error || 'Finnhub returned no_data'),
      httpStatus: resp.status,
      responseBody: rawBody,
    }
  }

  if (apiStatus && apiStatus !== 'ok') {
    const result: CandleFetchResult = {
      points: [] as SeriesPoint[],
      status: 'invalid_payload' as CandleFetchStatus,
      reason: `Unexpected status: ${apiStatus}`,
      httpStatus: resp.status,
      responseBody: rawBody,
    }

    console.warn(
      '[device/stocks] candle fetch invalid payload',
      JSON.stringify({
        symbol,
        resolution,
        from: fromSec,
        to: toSec,
        hasToken,
        httpStatus: resp.status,
        finnhubBody: rawBody,
      })
    )

    return result
  }

  if (!Array.isArray(body?.c) || !Array.isArray(body?.t)) {
    const result: CandleFetchResult = {
      points: [] as SeriesPoint[],
      status: 'invalid_payload' as CandleFetchStatus,
      reason: 'Missing candle arrays',
      httpStatus: resp.status,
      responseBody: rawBody,
    }

    console.warn(
      '[device/stocks] candle fetch missing arrays',
      JSON.stringify({
        symbol,
        resolution,
        from: fromSec,
        to: toSec,
        hasToken,
        httpStatus: resp.status,
        finnhubBody: rawBody,
      })
    )

    return result
  }

  const prices = body.c
  const ts = body.t
  const n = Math.min(prices.length, ts.length)

  const out: SeriesPoint[] = []
  for (let i = 0; i < n; i++) {
    const p = toNumber(prices[i])
    const t = toNumber(ts[i])
    if (p == null || t == null || t <= 0) continue
    out.push({ t: new Date(t * 1000).toISOString(), p })
  }

  const result: CandleFetchResult = {
    points: out,
    status: 'ok' as CandleFetchStatus,
    reason: '',
    httpStatus: resp.status,
    responseBody: rawBody,
  }

  return result
}

function getCandleRequestDebug(
  symbol: string,
  resolution: string,
  fromSec: number,
  toSec: number,
  hasToken: boolean
) {
  return {
    symbol,
    resolution,
    from: fromSec,
    to: toSec,
    hasToken,
  }
}

function getFallbackSeries(nowSec: number, previousClose: number, price: number): SeriesPoint[] {
  return [
    { t: new Date((nowSec - 24 * 3600) * 1000).toISOString(), p: previousClose },
    { t: new Date(nowSec * 1000).toISOString(), p: price },
  ]
}

function resolveCandleReason(status: CandleFetchStatus, reason: string, httpStatus: number | null) {
  if (status === 'ok') return ''
  if (status === 'http_error' && httpStatus != null) return `HTTP ${httpStatus}${reason ? `: ${reason}` : ''}`
  return reason
}

function logCandleException(symbol: string, resolution: string, fromSec: number, toSec: number, apiKey: string, error: unknown) {
  console.warn(
    '[device/stocks] candle fetch exception',
    JSON.stringify({
      ...getCandleRequestDebug(symbol, resolution, fromSec, toSec, Boolean(apiKey && apiKey.trim())),
      httpStatus: null,
      finnhubBody: '',
      reason: error instanceof Error ? error.message : 'Unknown error',
    })
  )
}

function summarizeCandleStatus(
  status: CandleFetchStatus,
  reason: string,
  httpStatus: number | null,
  responseBody: string,
  request: { symbol: string; resolution: string; from: number; to: number; hasToken: boolean }
) {
  return {
    status,
    reason: resolveCandleReason(status, reason, httpStatus),
    httpStatus,
    responseBody: responseBody.slice(0, 500),
    request,
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

    if (!symbol && !name) {
      return NextResponse.json({ error: 'Stock config missing symbol/name' }, { status: 404 })
    }

    const apiKey = process.env.FINNHUB_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing FINNHUB_API_KEY' }, { status: 500 })
    }

    const nowSec = Math.floor(Date.now() / 1000)
    const resolvedSymbol = symbol || name

    const quoteRaw = await fetchFinnhubQuote(resolvedSymbol, apiKey)

    let currency = ''
    try {
      currency = await fetchFinnhubCurrency(resolvedSymbol, apiKey)
    } catch {
      currency = ''
    }
    if (!currency) currency = inferCurrencyFromSymbol(resolvedSymbol)

    const price = toNumber(quoteRaw?.c)
    const change = toNumber(quoteRaw?.d)
    const changePercent = toNumber(quoteRaw?.dp)
    const previousClose = toNumber(quoteRaw?.pc)
    const open = toNumber(quoteRaw?.o)
    const high = toNumber(quoteRaw?.h)
    const low = toNumber(quoteRaw?.l)
    const asOf = toIsoOrNull(quoteRaw?.t)

    const candleStatus: Record<
      StockChartRange,
      {
        status: CandleFetchStatus
        reason: string
        httpStatus: number | null
        responseBody: string
        request: { symbol: string; resolution: string; from: number; to: number; hasToken: boolean }
      }
    > = {
      day: {
        status: 'exception',
        reason: 'Not requested',
        httpStatus: null,
        responseBody: '',
        request: getCandleRequestDebug(resolvedSymbol, '60', nowSec - 36 * 3600, nowSec, Boolean(apiKey && apiKey.trim())),
      },
      week: {
        status: 'exception',
        reason: 'Not requested',
        httpStatus: null,
        responseBody: '',
        request: getCandleRequestDebug(
          resolvedSymbol,
          'D',
          nowSec - 14 * 24 * 3600,
          nowSec,
          Boolean(apiKey && apiKey.trim())
        ),
      },
      month: {
        status: 'exception',
        reason: 'Not requested',
        httpStatus: null,
        responseBody: '',
        request: getCandleRequestDebug(
          resolvedSymbol,
          'D',
          nowSec - 45 * 24 * 3600,
          nowSec,
          Boolean(apiKey && apiKey.trim())
        ),
      },
      year: {
        status: 'exception',
        reason: 'Not requested',
        httpStatus: null,
        responseBody: '',
        request: getCandleRequestDebug(
          resolvedSymbol,
          'W',
          nowSec - 500 * 24 * 3600,
          nowSec,
          Boolean(apiKey && apiKey.trim())
        ),
      },
    }

    let day: SeriesPoint[] = []
    const dayFrom = nowSec - 36 * 3600
    try {
      const result = await fetchCandles(resolvedSymbol, '60', dayFrom, nowSec, apiKey)
      day = clampPoints(result.points, 24)
      candleStatus.day = summarizeCandleStatus(result.status, result.reason, result.httpStatus, result.responseBody, {
        symbol: resolvedSymbol,
        resolution: '60',
        from: dayFrom,
        to: nowSec,
        hasToken: Boolean(apiKey && apiKey.trim()),
      })
    } catch (error: unknown) {
      day = []
      candleStatus.day = {
        status: 'exception',
        reason: error instanceof Error ? error.message : 'Unknown error',
        httpStatus: null,
        responseBody: '',
        request: getCandleRequestDebug(resolvedSymbol, '60', dayFrom, nowSec, Boolean(apiKey && apiKey.trim())),
      }
      logCandleException(resolvedSymbol, '60', dayFrom, nowSec, apiKey, error)
    }

    let week: SeriesPoint[] = []
    const weekFrom = nowSec - 14 * 24 * 3600
    try {
      const result = await fetchCandles(resolvedSymbol, 'D', weekFrom, nowSec, apiKey)
      week = clampPoints(result.points, 10)
      candleStatus.week = summarizeCandleStatus(result.status, result.reason, result.httpStatus, result.responseBody, {
        symbol: resolvedSymbol,
        resolution: 'D',
        from: weekFrom,
        to: nowSec,
        hasToken: Boolean(apiKey && apiKey.trim()),
      })
    } catch (error: unknown) {
      week = []
      candleStatus.week = {
        status: 'exception',
        reason: error instanceof Error ? error.message : 'Unknown error',
        httpStatus: null,
        responseBody: '',
        request: getCandleRequestDebug(resolvedSymbol, 'D', weekFrom, nowSec, Boolean(apiKey && apiKey.trim())),
      }
      logCandleException(resolvedSymbol, 'D', weekFrom, nowSec, apiKey, error)
    }

    let month: SeriesPoint[] = []
    const monthFrom = nowSec - 45 * 24 * 3600
    try {
      const result = await fetchCandles(resolvedSymbol, 'D', monthFrom, nowSec, apiKey)
      month = clampPoints(result.points, 30)
      candleStatus.month = summarizeCandleStatus(
        result.status,
        result.reason,
        result.httpStatus,
        result.responseBody,
        {
          symbol: resolvedSymbol,
          resolution: 'D',
          from: monthFrom,
          to: nowSec,
          hasToken: Boolean(apiKey && apiKey.trim()),
        }
      )
    } catch (error: unknown) {
      month = []
      candleStatus.month = {
        status: 'exception',
        reason: error instanceof Error ? error.message : 'Unknown error',
        httpStatus: null,
        responseBody: '',
        request: getCandleRequestDebug(resolvedSymbol, 'D', monthFrom, nowSec, Boolean(apiKey && apiKey.trim())),
      }
      logCandleException(resolvedSymbol, 'D', monthFrom, nowSec, apiKey, error)
    }

    let year: SeriesPoint[] = []
    const yearFrom = nowSec - 500 * 24 * 3600
    try {
      const result = await fetchCandles(resolvedSymbol, 'W', yearFrom, nowSec, apiKey)
      year = clampPoints(result.points, 60)
      candleStatus.year = summarizeCandleStatus(result.status, result.reason, result.httpStatus, result.responseBody, {
        symbol: resolvedSymbol,
        resolution: 'W',
        from: yearFrom,
        to: nowSec,
        hasToken: Boolean(apiKey && apiKey.trim()),
      })
    } catch (error: unknown) {
      year = []
      candleStatus.year = {
        status: 'exception',
        reason: error instanceof Error ? error.message : 'Unknown error',
        httpStatus: null,
        responseBody: '',
        request: getCandleRequestDebug(resolvedSymbol, 'W', yearFrom, nowSec, Boolean(apiKey && apiKey.trim())),
      }
      logCandleException(resolvedSymbol, 'W', yearFrom, nowSec, apiKey, error)
    }

    const seriesByRange: Record<StockChartRange, SeriesPoint[]> = { day, week, month, year }
    let selectedSeries = seriesByRange[chartRange] || []
    const selectedStatus = candleStatus[chartRange]
    const selectedSeriesFailed = selectedStatus.status !== 'ok'

    if (selectedSeriesFailed && selectedSeries.length === 0 && price != null && previousClose != null) {
      selectedSeries = getFallbackSeries(nowSec, previousClose, price)
    }

    console.log(
      '[device/stocks] chart response',
      JSON.stringify({
        symbol: resolvedSymbol,
        requestedChartRange: chartRange,
        selectedSeriesLength: selectedSeries.length,
        seriesLengths: {
          day: day.length,
          week: week.length,
          month: month.length,
          year: year.length,
        },
        candleStatus,
      })
    )

    const response = {
      symbol: resolvedSymbol,
      name: name || resolvedSymbol,
      chartRange,
      currency,
      quote: {
        price,
        change,
        changePercent,
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
