import { after, NextResponse } from 'next/server'
import { newsCacheDecision } from '@/app/lib/news/cachePolicy'
import { createClient } from '@supabase/supabase-js'
import { optimizeFrameContent, PHYSICAL_AI_TIMEOUT_MS, supabaseTitleCache, type DisplayCapacityProfile } from '@/app/lib/frameContentOptimizer'

export const runtime = 'nodejs'

const DEFAULT_RSS_URL = 'https://www.nrk.no/toppsaker.rss'
const FRAME_REFRESH_SECONDS = 30 * 60
const MAX_NEWS_ITEMS = 20

type NewsItem = {
  id: string
  title: string
  url: string
  publishedAt: string | null
  order: number
}

function normalizeLimit(value: string | null) {
  const parsed = Math.floor(Number(value) || 14)
  return Math.max(1, Math.min(MAX_NEWS_ITEMS, parsed))
}

function requestedProfiles(value: string | null): DisplayCapacityProfile[] {
  const raw = String(value || 'standard').split(',').map((part) => part.trim())
  const profiles = raw.filter((profile): profile is DisplayCapacityProfile =>
    profile === 'compact' || profile === 'standard' || profile === 'spacious'
  )
  return [...new Set<DisplayCapacityProfile>(profiles.length ? profiles : ['standard'])]
}

function decodeXml(value: string) {
  return String(value || '')
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function xmlTag(block: string, tag: string) {
  const match = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i').exec(block)
  return decodeXml(match?.[1] || '')
}

function nrkArticleUrl(value: string) {
  try {
    const parsed = new URL(value)
    const host = parsed.hostname.toLowerCase()
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return ''
    if (host !== 'nrk.no' && !host.endsWith('.nrk.no')) return ''
    parsed.protocol = 'https:'
    return parsed.toString()
  } catch {
    return ''
  }
}

function parseRss(xml: string): NewsItem[] {
  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || []
  const seen = new Set<string>()
  const items: NewsItem[] = []
  blocks.forEach((block, order) => {
    const title = xmlTag(block, 'title')
    const url = nrkArticleUrl(xmlTag(block, 'link'))
    const guid = xmlTag(block, 'guid')
    const rawDate = xmlTag(block, 'pubDate') || xmlTag(block, 'dc:date')
    const timestamp = Date.parse(rawDate)
    const publishedAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
    if (!title || !url) return
    const id = guid || url
    if (seen.has(id)) return
    seen.add(id)
    items.push({ id, title, url, publishedAt, order })
  })
  return items.sort((a, b) => {
    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : NaN
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : NaN
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime
    return a.order - b.order
  })
}

type NewsSnapshot = {
  items: NewsItem[]
  available: boolean
  stale: boolean
  fetchedAt: string | null
}

type NewsFeedCacheRow = {
  items: NewsItem[] | null
  refreshed_at: string | null
  checked_at: string | null
}

async function loadNrkNews(): Promise<NewsSnapshot> {
  const configured = String(process.env.NRK_NEWS_RSS_URL || '').trim()
  const feedUrl = configured || DEFAULT_RSS_URL
  const parsedFeed = new URL(feedUrl)
  const host = parsedFeed.hostname.toLowerCase()
  if (host !== 'nrk.no' && !host.endsWith('.nrk.no')) throw new Error('NRK_NEWS_RSS_URL must point to nrk.no')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabase = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null

  let stored: NewsFeedCacheRow | null = null
  if (supabase) {
    const { data, error } = await supabase.from('news_feed_cache')
      .select('items, refreshed_at, checked_at').eq('feed_url', feedUrl).maybeSingle()
    if (error) console.warn('[news] snapshot read failed', { code: error.code })
    else stored = data as NewsFeedCacheRow | null
  }

  const oldItems = Array.isArray(stored?.items)
    ? stored.items.filter((item) => item && typeof item.id === 'string' &&
      typeof item.title === 'string' && item.title.length > 0 &&
      typeof item.url === 'string' && Boolean(nrkArticleUrl(item.url)))
    : []
  const decision = newsCacheDecision({
    refreshedAt: stored?.refreshed_at,
    checkedAt: stored?.checked_at,
    hasItems: oldItems.length > 0,
  })
  const fallback = (): NewsSnapshot => decision.usableStale
    ? { items: oldItems, available: true, stale: true, fetchedAt: stored?.refreshed_at ?? null }
    : { items: [], available: false, stale: false, fetchedAt: null }

  if (decision.fresh) {
    return { items: oldItems, available: true, stale: false, fetchedAt: stored?.refreshed_at ?? null }
  }
  // If NRK is rejecting requests, do not retry on every wake or parallel
  // render-state request. This limit also works when no good snapshot exists.
  if (!decision.retryAllowed) return fallback()

  try {
    const response = await fetch(parsedFeed.toString(), {
      headers: {
        Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
        'User-Agent': 'RE:MIND/1.0 (+https://re-mind.no)',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error('NRK RSS returned ' + response.status)
    const items = parseRss(await response.text())
    if (!items.length) throw new Error('NRK RSS contained no valid articles')

    const checkedAt = new Date().toISOString()
    if (supabase) {
      const { error } = await supabase.from('news_feed_cache').upsert({
        feed_url: feedUrl, items, refreshed_at: checkedAt, checked_at: checkedAt,
      }, { onConflict: 'feed_url' })
      if (error) console.warn('[news] snapshot write failed', { code: error.code })
    }
    return { items, available: true, stale: false, fetchedAt: checkedAt }
  } catch (error) {
    console.warn('[news] RSS fetch failed', error instanceof Error ? error.message : String(error))
    if (supabase) {
      // A concurrent successful fetch must never be overwritten by the
      // failure's old snapshot. Update only the observed row/version.
      const checkedAt = new Date().toISOString()
      if (stored) {
        let update = supabase.from('news_feed_cache').update({ checked_at: checkedAt })
          .eq('feed_url', feedUrl)
        update = stored.refreshed_at
          ? update.eq('refreshed_at', stored.refreshed_at)
          : update.is('refreshed_at', null)
        const { error } = await update
        if (error) console.warn('[news] retry backoff update failed', { code: error.code })
      } else {
        const { error } = await supabase.from('news_feed_cache').upsert({
          feed_url: feedUrl, items: [], refreshed_at: null, checked_at: checkedAt,
        }, { onConflict: 'feed_url', ignoreDuplicates: true })
        if (error) console.warn('[news] retry backoff insert failed', { code: error.code })
      }
    }
    return fallback()
  }
}

export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url)
    const limit = normalizeLimit(requestUrl.searchParams.get('limit'))
    const includeLinks = requestUrl.searchParams.get('links') !== '0'
    const profiles = requestedProfiles(requestUrl.searchParams.get('display_profiles') || requestUrl.searchParams.get('display_profile'))
    const snapshot = await loadNrkNews()
    const selected = snapshot.items.slice(0, limit)
    // A failed source must not turn the entire frame render-state into HTTP 500.
    // Once the two-hour safety window passes, show unavailable instead of
    // continuing to display yesterday's headlines as current.
    if (!snapshot.available) return NextResponse.json({
      ok: false, source: 'NRK', stale: false, items: [], error: 'News temporarily unavailable',
    }, { headers: { 'Cache-Control': 'private, no-store' } })

    // The physical frame measures and wraps the original, complete RSS title.
    // Do not send it an optimizer fallback that may end in an unfinished phrase.
    // Keep the existing optimized response unchanged for app/other callers.
    if (requestUrl.searchParams.get('raw_titles') === '1') {
      return NextResponse.json({
        ok: true,
        source: 'NRK',
        refresh_seconds: FRAME_REFRESH_SECONDS,
        stale: snapshot.stale,
        fetched_at: snapshot.fetchedAt,
        items: selected.map((item) => ({
          id: item.id,
          title: item.title,
          ...(includeLinks ? { url: item.url, published_at: item.publishedAt } : {}),
        })),
      })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const persistentCache = supabaseUrl && serviceRoleKey
      ? supabaseTitleCache(createClient(supabaseUrl, serviceRoleKey))
      : undefined

    const optimizerItems = selected.map((item, index) => ({
      id: String(index),
      title: item.title,
      source: 'nrk',
      contentType: 'news' as const,
    }))
    const optimizedByProfile = new Map(await Promise.all(profiles.map(async (displayProfile) => {
      const titles = await optimizeFrameContent(optimizerItems, {
        displayProfile,
        persistentCache,
        fastBudgetMs: PHYSICAL_AI_TIMEOUT_MS,
        aiTimeoutMs: 5000,
        defer: (work) => after(async () => { await work }),
      })
      return [displayProfile, new Map(titles.map((item) => [Number(item.id), item.title]))] as const
    })))

    const primary = optimizedByProfile.get(profiles[0])
    const items = selected.map((item, index) => ({
      id: item.id,
      title: primary?.get(index) || item.title,
      profile_titles: Object.fromEntries(profiles.map((profile) => [profile, optimizedByProfile.get(profile)?.get(index) || item.title])),
      ...(includeLinks ? { url: item.url, published_at: item.publishedAt } : {}),
    }))

    return NextResponse.json({ ok: true, source: 'NRK', refresh_seconds: FRAME_REFRESH_SECONDS,
      stale: snapshot.stale, fetched_at: snapshot.fetchedAt, items },
      { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[news]', error)
    return NextResponse.json({ ok: false, source: 'NRK', stale: false, items: [], error: 'News temporarily unavailable' },
      { headers: { 'Cache-Control': 'private, no-store' } })
  }
}
