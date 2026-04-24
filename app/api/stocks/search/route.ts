import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type FinnhubSearchItem = {
  symbol?: string
  description?: string
  type?: string
  mic?: string
  exchange?: string
  displaySymbol?: string
}

type StockSearchResult = {
  symbol: string
  displayName: string
  exchange: string
  country: string
}

type StockSearchResultRanked = StockSearchResult & {
  preferred: number
}

function inferCountry(symbol: string, exchange: string) {
  const s = symbol.toUpperCase()
  const ex = exchange.toUpperCase()
  if (s.endsWith('.OL') || ex === 'OL' || ex === 'OSE') return 'NO'
  if (s.endsWith('.ST') || ex === 'ST') return 'SE'
  if (s.endsWith('.CO') || ex === 'CO') return 'DK'
  if (s.endsWith('.HE') || ex === 'HE') return 'FI'
  return ''
}

function normalizeType(rawType: string) {
  const t = String(rawType || '').trim().toLowerCase()
  return t
}

function isPreferredEquityType(rawType: string) {
  const t = normalizeType(rawType)
  if (!t) return true
  return t === 'common stock' || t === 'equity' || t === 'etp'
}

function isNoisyType(rawType: string) {
  const t = normalizeType(rawType)
  return (
    t.includes('etf') ||
    t.includes('fund') ||
    t.includes('index') ||
    t.includes('forex') ||
    t.includes('crypto') ||
    t.includes('warrant') ||
    t.includes('right')
  )
}

export async function GET(req: NextRequest) {
  try {
    const q = String(req.nextUrl.searchParams.get('q') || '').trim()
    if (q.length < 2) {
      return NextResponse.json({ results: [] })
    }

    const apiKey = process.env.FINNHUB_API_KEY
    if (!apiKey) {
      return NextResponse.json({ results: [], error: 'Missing FINNHUB_API_KEY' }, { status: 500 })
    }

    const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${encodeURIComponent(apiKey)}`
    const resp = await fetch(url, { cache: 'no-store' })

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return NextResponse.json(
        { results: [], error: `Finnhub search failed (${resp.status})`, details: txt || null },
        { status: 502 }
      )
    }

    const payload = (await resp.json()) as { result?: FinnhubSearchItem[] }
    const raw = Array.isArray(payload?.result) ? payload.result : []

    const out: StockSearchResultRanked[] = []
    const seen = new Set<string>()

    for (const item of raw) {
      const symbol = String(item?.symbol || '').trim().toUpperCase()
      if (!symbol) continue

      const type = String(item?.type || '').trim()
      if (isNoisyType(type)) continue

      const description = String(item?.description || '').trim()
      const exchange = String(item?.exchange || item?.mic || '').trim().toUpperCase()
      const country = inferCountry(symbol, exchange)

      const dedupeKey = `${symbol}__${exchange}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      out.push({
        symbol,
        displayName: description || symbol,
        exchange,
        country,
        preferred: isPreferredEquityType(type) ? 1 : 0,
      })
    }

    const queryLower = q.toLowerCase()
    const ranked = out
      .sort((a, b) => {
        const aExact = a.symbol.toLowerCase() === queryLower ? 1 : 0
        const bExact = b.symbol.toLowerCase() === queryLower ? 1 : 0
        if (aExact !== bExact) return bExact - aExact

        const aNo = a.country === 'NO' ? 1 : 0
        const bNo = b.country === 'NO' ? 1 : 0
        if (aNo !== bNo) return bNo - aNo

        if (a.preferred !== b.preferred) return b.preferred - a.preferred

        return a.symbol.localeCompare(b.symbol)
      })
      .map((item) => ({
        symbol: item.symbol,
        displayName: item.displayName,
        exchange: item.exchange,
        country: item.country,
      }))
      .slice(0, 20)

    return NextResponse.json({ results: ranked })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ results: [], error: message }, { status: 500 })
  }
}
