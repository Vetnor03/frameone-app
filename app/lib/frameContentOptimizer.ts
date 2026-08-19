type FrameContentSource = 'remind' | 'spond' | 'teams' | 'waste' | 'local-events' | string
export type FrameContentType = 'reminder' | 'countdown' | 'ai-follow'

export type FrameContentInput = {
  id: string
  title: string
  source?: FrameContentSource
  contentType?: FrameContentType
  displayDate?: string
  displayTime?: string | null
}

export type FrameContentOutput = {
  id: string
  title: string
}

type CacheEntry = {
  title: string
  expiresAt: number
}

type OpenAIResponsePayload = {
  output?: Array<{
    type?: string
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
}

type StructuredOptimizerResponse = {
  items?: Array<{
    id?: unknown
    title?: unknown
  }>
}

const DEFAULT_MODEL = 'gpt-5.6'
const DEFAULT_MAX_TITLE_CHARS = 48
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_CACHE_ENTRIES = 500
const REQUEST_TIMEOUT_MS = 5000

const titleCache = new Map<string, CacheEntry>()

const OPTIMIZER_INSTRUCTIONS = `You optimize tiny pieces of text for a calm e-ink home display called RE:MIND.

Rewrite each title so it is immediately understandable at a glance.
- Keep the original language.
- Prefer 2-6 words when possible.
- Remove filler, duplicated context and provider boilerplate such as meeting platform names.
- Preserve the essential action, subject, person, team, project, place or other identifying detail.
- Dates and times are rendered separately, so do not add them unless they are essential to the meaning.
- Never invent, infer or change facts.
- Never turn a specific title into a vague generic title.
- Do not add emojis or decorative punctuation.
- Respect maxTitleChars for every item.
- Follow the contentType-specific rules:
  - reminder: retain the action or event needed for a useful reminder.
  - countdown: produce a compact countdown title; remove phrases such as "days until" or "time left until" because the countdown value is rendered separately.
  - ai-follow: turn the update into a calm, specific, headline-like summary; never return a paragraph.
- Return exactly one result for every supplied id.`

function normalizeText(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function truncateAtWordBoundary(value: string, maxChars: number) {
  const normalized = normalizeText(value)
  if (normalized.length <= maxChars) return normalized

  const clipped = normalized.slice(0, maxChars + 1)
  const lastSpace = clipped.lastIndexOf(' ')
  const safeCut = lastSpace >= Math.floor(maxChars * 0.55) ? clipped.slice(0, lastSpace) : clipped.slice(0, maxChars)
  return safeCut.replace(/[\s,;:|/\-–—]+$/g, '').trim()
}

function fallbackTitle(title: string, maxChars: number) {
  return truncateAtWordBoundary(title, maxChars)
}

function optimizationEnabled() {
  const explicit = String(process.env.FRAME_AI_OPTIMIZATION_ENABLED || '').trim().toLowerCase()
  if (explicit === '0' || explicit === 'false' || explicit === 'no' || explicit === 'off') return false
  return Boolean(process.env.OPENAI_API_KEY)
}

function cacheKey(item: FrameContentInput, model: string, maxChars: number) {
  return [model, maxChars, item.contentType || 'reminder', item.source || 'unknown', normalizeText(item.title)].join('::')
}

function getCachedTitle(key: string) {
  const entry = titleCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    titleCache.delete(key)
    return null
  }
  return entry.title
}

function setCachedTitle(key: string, title: string) {
  if (titleCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = titleCache.keys().next().value as string | undefined
    if (oldestKey) titleCache.delete(oldestKey)
  }
  titleCache.set(key, { title, expiresAt: Date.now() + CACHE_TTL_MS })
}

function extractOutputText(payload: OpenAIResponsePayload) {
  for (const output of payload.output || []) {
    if (output.type !== 'message') continue
    for (const content of output.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text
    }
  }
  return ''
}

async function requestOptimizedTitles(
  items: FrameContentInput[],
  model: string,
  maxTitleChars: number
): Promise<Map<string, string>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'developer',
            content: [{ type: 'input_text', text: OPTIMIZER_INSTRUCTIONS }],
          },
          {
            role: 'user',
            content: [{
              type: 'input_text',
              text: JSON.stringify({
                maxTitleChars,
                items: items.map((item) => ({
                  id: item.id,
                  title: normalizeText(item.title),
                  contentType: item.contentType || 'reminder',
                  source: item.source || 'unknown',
                  displayDate: item.displayDate || null,
                  displayTime: item.displayTime || null,
                })),
              }),
            }],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'frame_title_optimizations',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                    },
                    required: ['id', 'title'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['items'],
              additionalProperties: false,
            },
          },
        },
        max_output_tokens: 500,
      }),
    })

    if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`)

    const payload = await response.json() as OpenAIResponsePayload
    const outputText = extractOutputText(payload)
    if (!outputText) throw new Error('OpenAI response did not contain output text')

    const parsed = JSON.parse(outputText) as StructuredOptimizerResponse
    const allowedIds = new Set(items.map((item) => item.id))
    const results = new Map<string, string>()

    for (const item of parsed.items || []) {
      const id = typeof item.id === 'string' ? item.id : ''
      const title = typeof item.title === 'string' ? item.title : ''
      if (!allowedIds.has(id) || !title) continue
      results.set(id, fallbackTitle(title, maxTitleChars))
    }

    return results
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Creates frame-only display titles. Source content is never mutated or persisted.
 * Any missing key, API failure, timeout or invalid model response falls back to a
 * deterministic word-safe truncation so a frame refresh can never depend on AI.
 */
export async function optimizeFrameContent(
  items: FrameContentInput[],
  options: { maxTitleChars?: number } = {}
): Promise<FrameContentOutput[]> {
  const maxTitleChars = Math.max(16, Math.floor(options.maxTitleChars || DEFAULT_MAX_TITLE_CHARS))
  const model = String(process.env.FRAME_AI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL

  const normalized = items.map((item) => ({ ...item, title: normalizeText(item.title) }))
  const fallback = normalized.map((item) => ({ id: item.id, title: fallbackTitle(item.title, maxTitleChars) }))
  if (normalized.length === 0 || !optimizationEnabled()) return fallback

  const results = new Map<string, string>()
  const uncached: FrameContentInput[] = []

  for (const item of normalized) {
    const key = cacheKey(item, model, maxTitleChars)
    const cached = getCachedTitle(key)
    if (cached) results.set(item.id, cached)
    else uncached.push(item)
  }

  if (uncached.length > 0) {
    try {
      const fresh = await requestOptimizedTitles(uncached, model, maxTitleChars)
      for (const item of uncached) {
        const optimized = fresh.get(item.id)
        if (!optimized) continue
        results.set(item.id, optimized)
        setCachedTitle(cacheKey(item, model, maxTitleChars), optimized)
      }
    } catch (error) {
      console.warn('[frame-content-optimizer] AI optimization unavailable; using deterministic fallback', {
        error: error instanceof Error ? error.message : 'unknown error',
        itemCount: uncached.length,
      })
    }
  }

  return normalized.map((item) => ({
    id: item.id,
    title: results.get(item.id) || fallbackTitle(item.title, maxTitleChars),
  }))
}
