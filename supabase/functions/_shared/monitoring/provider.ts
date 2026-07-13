export type WatchStatus = 'no_change' | 'change' | 'uncertain' | 'error'

export type MonitoringProviderResult = {
  status: Exclude<WatchStatus, 'error'>
  trigger_met: boolean
  headline: string | null
  summary: string | null
  event_at: string | null
  confidence: number
  fingerprint: string | null
  sources: Array<{ url: string; title: string; published_at: string | null }>
  suggested_next_check_minutes: number
  response_id?: string | null
  usage?: Record<string, unknown>
  raw?: Record<string, unknown>
}

export function stableFingerprint(input: { fingerprint?: string | null; headline?: string | null; summary?: string | null; sources?: Array<{ url?: string | null }> }) {
  const explicit = input.fingerprint?.trim().toLowerCase()
  if (explicit) return explicit.replace(/\s+/g, '-')
  const material = [input.headline, input.summary, ...(input.sources || []).map((s) => s.url || '')]
    .join('|')
    .toLowerCase()
    .replace(/https?:\/\/(www\.)?/g, '')
    .replace(/[#?].*?(?=\||$)/g, '')
    .replace(/[^a-z0-9æøå]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return material.slice(0, 180) || null
}

export function mockMonitoringResult(mode = 'no_change'): MonitoringProviderResult {
  if (mode === 'error') throw new Error('Mock monitoring provider error')
  if (mode === 'change') return {
    status: 'change', trigger_met: true, headline: 'Mock watch update', summary: 'A deterministic mock development was found.', event_at: '2026-07-13T00:00:00.000Z', confidence: 0.92, fingerprint: 'mock-development-2026-07-13', sources: [{ url: 'https://example.com/mock-development', title: 'Mock development', published_at: '2026-07-13T00:00:00.000Z' }], suggested_next_check_minutes: 60,
  }
  if (mode === 'uncertain') return { status: 'uncertain', trigger_met: false, headline: null, summary: 'Mock uncertain result.', event_at: null, confidence: 0.35, fingerprint: null, sources: [{ url: 'https://example.com/uncertain', title: 'Uncertain', published_at: null }], suggested_next_check_minutes: 120 }
  return { status: 'no_change', trigger_met: false, headline: null, summary: null, event_at: null, confidence: 0, fingerprint: null, sources: [], suggested_next_check_minutes: 60 }
}

export const monitoringJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['status', 'trigger_met', 'headline', 'summary', 'event_at', 'confidence', 'fingerprint', 'sources', 'suggested_next_check_minutes'],
  properties: {
    status: { type: 'string', enum: ['no_change', 'change', 'uncertain'] }, trigger_met: { type: 'boolean' }, headline: { type: ['string', 'null'] }, summary: { type: ['string', 'null'] }, event_at: { type: ['string', 'null'] }, confidence: { type: 'number', minimum: 0, maximum: 1 }, fingerprint: { type: ['string', 'null'] }, sources: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['url', 'title', 'published_at'], properties: { url: { type: 'string' }, title: { type: 'string' }, published_at: { type: ['string', 'null'] } } } }, suggested_next_check_minutes: { type: 'integer', minimum: 5, maximum: 10080 },
  },
} as const

export async function runOpenAIWatch(watch: Record<string, unknown>, apiKey: string, model: string) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      tools: [{ type: 'web_search_preview' }],
      include: ['web_search_call.action.sources'],
      store: false,
      input: `Public web monitoring only. Determine whether this watch has a genuinely new relevant development. Original request: ${watch.original_request}\nGoal: ${watch.normalized_goal}\nTrigger: ${watch.trigger_description}\nSearch guidance JSON: ${JSON.stringify(watch.search_guidance ?? {})}`,
      text: { format: { type: 'json_schema', name: 'monitoring_watch_result', strict: true, schema: monitoringJsonSchema } },
    }),
  })
  if (!response.ok) throw new Error(`OpenAI Responses API failed: ${response.status} ${await response.text()}`)
  const json = await response.json()
  const text = json.output_text ?? json.output?.flatMap((o: any) => o.content || []).find((c: any) => c.type === 'output_text')?.text
  if (!text) throw new Error('OpenAI response did not include output_text')
  return { ...JSON.parse(text), response_id: json.id, usage: json.usage ?? {}, raw: json }
}
