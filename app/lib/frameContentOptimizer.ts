import { createHash } from 'node:crypto'
import { sanitizeFrameText } from './frameText.mjs'

type FrameContentSource = 'remind' | 'spond' | 'teams' | 'waste' | 'local-events' | string
export type FrameContentType = 'reminder' | 'countdown' | 'ai-follow'
export type DisplayCapacityProfile = 'compact' | 'standard' | 'spacious'
export type FrameUiLanguage = 'en' | 'no'

export type FrameContentInput = {
  id: string
  title: string
  source?: FrameContentSource
  contentType?: FrameContentType
  displayDate?: string
  displayTime?: string | null
}
export type FrameContentOutput = { id: string; title: string }
export type PersistentTitleCache = {
  read(keys: string[]): Promise<Array<{ cache_key: string; optimized_title: string }>>
  write(rows: PersistentCacheRow[]): Promise<void>
}
export type PersistentCacheRow = {
  cache_key: string
  optimized_title: string
  optimizer_version: string
  model: string
  display_profile: string
  updated_at: string
}

type OpenAIResponsePayload = { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> }
type StructuredOptimizerResponse = { items?: Array<{ id?: unknown; title?: unknown }> }

export const FRAME_TITLE_OPTIMIZER_VERSION = 'v2-source-language'
const DEFAULT_MODEL = 'gpt-5.6'
const MAX_CACHE_ENTRIES = 1000
export const PHYSICAL_AI_TIMEOUT_MS = 250
const PROFILE_LIMITS: Record<DisplayCapacityProfile, { maxTitleChars: number; maxLines: number }> = {
  compact: { maxTitleChars: 28, maxLines: 1 },
  standard: { maxTitleChars: 48, maxLines: 2 },
  spacious: { maxTitleChars: 72, maxLines: 3 },
}
const titleCache = new Map<string, string>()
const inFlightOptimizations = new Map<string, Promise<string | null>>()

const INSTRUCTIONS = `Optimize titles for a calm e-ink home display. Produce each output in the same natural language as that item's source title. Infer language from the source text itself; do not translate merely to match app or frame UI language. For ambiguous names or neutral tokens only, use the supplied UI language as fallback. Preserve facts, Norwegian æ/ø/å, and the natural dominant language of mixed-language source text. Remove filler and provider boilerplate. Dates and times are rendered separately. Use plain typography and no emoji. Return every supplied id and respect each display profile, maximum characters, and line count.`

const normalizeText = (value: string) => String(value || '').replace(/\s+/g, ' ').trim()
function truncateAtWordBoundary(value: string, maxChars: number) {
  const normalized = normalizeText(value)
  if (normalized.length <= maxChars) return normalized
  const clipped = normalized.slice(0, maxChars + 1)
  const lastSpace = clipped.lastIndexOf(' ')
  return (lastSpace >= Math.floor(maxChars * .55) ? clipped.slice(0, lastSpace) : clipped.slice(0, maxChars))
    .replace(/[\s,;:|/\-–—]+$/g, '').trim()
}
const fallbackTitle = (title: string, maxChars: number) => truncateAtWordBoundary(sanitizeFrameText(title), maxChars)

/** Profiles follow renderer capacity, not raw pixels: one title line/roughly 28 chars,
 * two lines/48 chars, or three-plus lines/72 chars. Nearby geometries therefore share a key. */
export function deriveReminderDisplayProfile(input: { usableWidth?: number; maxLines?: number }): DisplayCapacityProfile {
  const width = Math.max(0, Number(input.usableWidth) || 0)
  const lines = Math.max(1, Math.floor(Number(input.maxLines) || 1))
  const usefulChars = Math.floor(width / 10) * lines
  if (lines <= 1 || usefulChars <= 30) return 'compact'
  if (lines <= 2 || usefulChars <= 56) return 'standard'
  return 'spacious'
}

export function frameTitleCacheKey(item: FrameContentInput, profile: DisplayCapacityProfile, model = DEFAULT_MODEL, uiLanguage: FrameUiLanguage = 'en') {
  const identity = [FRAME_TITLE_OPTIMIZER_VERSION, model, uiLanguage, item.contentType || 'reminder', item.source || 'unknown', normalizeText(item.title), profile]
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex')
}

export function supabaseTitleCache(client: any): PersistentTitleCache {
  return {
    async read(keys) {
      if (!keys.length) return []
      const { data, error } = await client.from('frame_content_title_cache').select('cache_key, optimized_title').in('cache_key', keys)
      if (error) throw error
      return Array.isArray(data) ? data : []
    },
    async write(rows) {
      if (!rows.length) return
      const { error } = await client.from('frame_content_title_cache').upsert(rows, { onConflict: 'cache_key', ignoreDuplicates: true })
      if (error) throw error
    },
  }
}

function remember(key: string, title: string) {
  if (titleCache.size >= MAX_CACHE_ENTRIES) titleCache.delete(titleCache.keys().next().value as string)
  titleCache.set(key, title)
}
export function clearFrameTitleL1CacheForTests() { titleCache.clear() }
export function clearFrameTitleInflightForTests() { inFlightOptimizations.clear() }
function enabled() {
  const value = String(process.env.FRAME_AI_OPTIMIZATION_ENABLED || '').toLowerCase()
  return !['0', 'false', 'no', 'off'].includes(value) && Boolean(process.env.OPENAI_API_KEY)
}
function extract(payload: OpenAIResponsePayload) {
  for (const output of payload.output || []) for (const content of output.content || [])
    if (output.type === 'message' && content.type === 'output_text' && typeof content.text === 'string') return content.text
  return ''
}

async function requestTitles(items: FrameContentInput[], model: string, profile: DisplayCapacityProfile, uiLanguage: FrameUiLanguage, timeoutMs: number) {
  const constraints = PROFILE_LIMITS[profile]
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: [
        { role: 'developer', content: [{ type: 'input_text', text: INSTRUCTIONS }] },
        { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ displayProfile: profile, uiLanguage, ...constraints, items: items.map(i => ({ id: i.id, title: normalizeText(i.title), contentType: i.contentType || 'reminder', source: i.source || 'unknown' })) }) }] },
      ], text: { format: { type: 'json_schema', name: 'frame_title_optimizations', strict: true, schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } }, required: ['id', 'title'], additionalProperties: false } } }, required: ['items'], additionalProperties: false } } }, max_output_tokens: 500 }),
    })
    if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`)
    const parsed = JSON.parse(extract(await response.json() as OpenAIResponsePayload) || '{}') as StructuredOptimizerResponse
    return new Map((parsed.items || []).flatMap(i => typeof i.id === 'string' && typeof i.title === 'string' ? [[i.id, fallbackTitle(i.title, constraints.maxTitleChars)] as const] : []))
  } finally { clearTimeout(timeout) }
}

/** Durable, batch-oriented optimization. Cache errors and AI errors are fail-soft. */
export async function optimizeFrameContent(items: FrameContentInput[], options: {
  maxTitleChars?: number
  displayProfile?: DisplayCapacityProfile
  uiLanguage?: FrameUiLanguage
  persistentCache?: PersistentTitleCache
  aiTimeoutMs?: number
  fastBudgetMs?: number
  defer?: (work: Promise<unknown>) => void
} = {}): Promise<FrameContentOutput[]> {
  const profile = options.displayProfile || (options.maxTitleChars && options.maxTitleChars <= 30 ? 'compact' : options.maxTitleChars && options.maxTitleChars > 56 ? 'spacious' : 'standard')
  const maxChars = options.maxTitleChars || PROFILE_LIMITS[profile].maxTitleChars
  const model = String(process.env.FRAME_AI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL
  const uiLanguage: FrameUiLanguage = options.uiLanguage === 'no' ? 'no' : 'en'
  const normalized = items.map(i => ({ ...i, title: sanitizeFrameText(i.title) }))
  const keys = normalized.map(i => frameTitleCacheKey(i, profile, model, uiLanguage))
  const results = new Map<string, string>()

  keys.forEach((key, index) => { const hit = titleCache.get(key); if (hit) results.set(normalized[index].id, hit) })
  const missingKeys = keys.filter((key, index) => !results.has(normalized[index].id))
  let persistentReadSucceeded = true
  if (missingKeys.length && options.persistentCache) try {
    for (const row of await options.persistentCache.read([...new Set(missingKeys)])) remember(row.cache_key, row.optimized_title)
    keys.forEach((key, index) => { const hit = titleCache.get(key); if (hit) results.set(normalized[index].id, hit) })
  } catch (error) {
    persistentReadSucceeded = false
    console.warn('[frame-content-optimizer] persistent cache unavailable; skipping AI', error)
  }

  // Physical title generation is only useful when it can become durable. A
  // missing/broken cache must never cause repeatedly changing AI wording.
  if (!persistentReadSucceeded) {
    return normalized.map(item => ({ id: item.id, title: fallbackTitle(item.title, maxChars) }))
  }

  // De-duplicate identical source/profile variants before the single batched AI request.
  const unique = new Map<string, FrameContentInput>()
  normalized.forEach((item, index) => { if (!results.has(item.id) && !unique.has(keys[index])) unique.set(keys[index], { ...item, id: keys[index] }) })
  if (unique.size && enabled()) {
    const newEntries = [...unique].filter(([key]) => !inFlightOptimizations.has(key))
    if (newEntries.length) {
      const batch = (async () => {
        try {
          const fresh = await requestTitles(newEntries.map(([, item]) => item), model, profile, uiLanguage, options.aiTimeoutMs ?? 5000)
          const rows = newEntries.flatMap(([key]) => {
            const title = fresh.get(key)
            return title ? [{ cache_key: key, optimized_title: title, optimizer_version: FRAME_TITLE_OPTIMIZER_VERSION, model, display_profile: profile, updated_at: new Date().toISOString() }] : []
          })
          // Never expose an AI title until its durable write succeeds.
          if (rows.length && options.persistentCache) await options.persistentCache.write(rows)
          for (const row of rows) remember(row.cache_key, row.optimized_title)
          return fresh
        } catch (error) {
          console.warn('[frame-content-optimizer] AI optimization was not persisted; using deterministic fallback', error)
          return new Map<string, string>()
        }
      })()
      for (const [key] of newEntries) {
        const task = batch.then(fresh => fresh.get(key) || null).finally(() => inFlightOptimizations.delete(key))
        inFlightOptimizations.set(key, task)
      }
    }

    const pending = Promise.allSettled([...unique.keys()].map(key => inFlightOptimizations.get(key)!))
    if (options.defer) options.defer(pending)
    const fastBudgetMs = Math.max(0, options.fastBudgetMs ?? (options.aiTimeoutMs ?? 5000))
    await Promise.race([pending, new Promise(resolve => setTimeout(resolve, fastBudgetMs))])
    normalized.forEach((item, index) => { const hit = titleCache.get(keys[index]); if (hit) results.set(item.id, hit) })
  }

  return normalized.map(item => ({ id: item.id, title: results.get(item.id) || fallbackTitle(item.title, maxChars) }))
}
