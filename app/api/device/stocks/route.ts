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

function downsampleSeries(points: SeriesPoint[], maxPoints: number) {
  if (points.length <= maxPoints) return points
  if (maxPoints <= 1) return points.length ? [points[points.length - 1]] : []

  const out: SeriesPoint[] = []
  const lastIdx = points.length - 1
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i * lastIdx) / (maxPoints - 1))
    out.push(points[idx])
  }

  return out
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
  const url =
    `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}` +
    `&resolution=${encodeURIComponent(resolution)}` +
    `&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(apiKey)}`

  const resp = await fetch(url, { cache: 'no-store' })
  if (!resp.ok) return [] as SeriesPoint[]

  const body = (await resp.json()) as {
    s?: string
    c?: number[]
    t?: number[]
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

  return out
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

    let day: SeriesPoint[] = []
    let week: SeriesPoint[] = []
    let month: SeriesPoint[] = []
    let year: SeriesPoint[] = []

    try {
      day = await fetchCandles(resolvedSymbol, '60', nowSec - 36 * 3600, nowSec, apiKey)
      day = clampPoints(day, 24)
    } catch {
      day = []
    }

    try {
      week = await fetchCandles(resolvedSymbol, 'D', nowSec - 14 * 24 * 3600, nowSec, apiKey)
      week = clampPoints(week, 10)
    } catch {
      week = []
    }

    try {
      month = await fetchCandles(resolvedSymbol, 'D', nowSec - 45 * 24 * 3600, nowSec, apiKey)
      month = clampPoints(month, 30)
    } catch {
      month = []
    }

    try {
      year = await fetchCandles(resolvedSymbol, 'D', nowSec - 380 * 24 * 3600, nowSec, apiKey)
      year = downsampleSeries(year, 52)
    } catch {
      year = []
    }

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
      series: {
        day,
        week,
        month,
        year,
      },
      selectedSeries: ({ day, week, month, year } as Record<StockChartRange, SeriesPoint[]>)[chartRange] || [],
      signature: makeSignature(resolvedSymbol, price, change, changePercent),
    }

    return NextResponse.json(response)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
