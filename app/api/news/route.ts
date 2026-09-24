import { after, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { optimizeFrameContent, PHYSICAL_AI_TIMEOUT_MS, supabaseTitleCache, type DisplayCapacityProfile } from '@/app/lib/frameContentOptimizer'

export const runtime = 'nodejs'

const DEFAULT_RSS_URL = 'https://www.nrk.no/toppsaker.rss'
const RSS_REVALIDATE_SECONDS = 15 * 60
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
  return [...new Set(profiles.length ? profiles : ['standard'])]
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

async function loadNrkNews() {
  const configured = String(process.env.NRK_NEWS_RSS_URL || '').trim()
  const feedUrl = configured || DEFAULT_RSS_URL
  const parsedFeed = new URL(feedUrl)
  const host = parsedFeed.hostname.toLowerCase()
  if (host !== 'nrk.no' && !host.endsWith('.nrk.no')) throw new Error('NRK_NEWS_RSS_URL must point to nrk.no')
  const response = await fetch(parsedFeed.toString(), {
    headers: { Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8' },
    next: { revalidate: RSS_REVALIDATE_SECONDS },
  })
  if (!response.ok) throw new Error('NRK RSS returned ' + response.status)
  return parseRss(await response.text())
}

export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url)
    const limit = normalizeLimit(requestUrl.searchParams.get('limit'))
    const includeLinks = requestUrl.searchParams.get('links') !== '0'
    const profiles = requestedProfiles(requestUrl.searchParams.get('display_profiles') || requestUrl.searchParams.get('display_profile'))
    const selected = (await loadNrkNews()).slice(0, limit)

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

    return NextResponse.json({ ok: true, source: 'NRK', refresh_seconds: FRAME_REFRESH_SECONDS, items })
  } catch (error) {
    console.error('[news]', error)
    return NextResponse.json({ ok: false, source: 'NRK', items: [], error: 'News temporarily unavailable' }, { status: 502 })
  }
}
