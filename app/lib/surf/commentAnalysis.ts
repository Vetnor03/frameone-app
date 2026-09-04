export const SURF_COMMENT_ANALYSIS_VERSION = 'surf-comment-v1'
export const SURF_COMMENT_MIN_CONFIDENCE = 0.55
export const SURF_COMMENT_MAX_LENGTH = 500

export const SURF_COMMENT_DRIVER_DIMENSIONS = [
  'wave_height', 'wave_period', 'swell_direction', 'wind_speed',
  'wind_direction', 'multi_swell',
] as const

export type SurfCommentDriverDimension = typeof SURF_COMMENT_DRIVER_DIMENSIONS[number]
export type SurfCommentAnalysis = {
  summary: string
  confidence: number
  drivers: Array<{ dimension: SurfCommentDriverDimension; effect: 'better' | 'worse' | 'neutral'; strength: number }>
  observations: {
    forecast_size_relation: 'smaller_than_expected' | 'as_expected' | 'bigger_than_expected' | null
    surface_quality: 'clean' | 'mixed' | 'messy' | null
    consistency: 'low' | 'normal' | 'high' | null
    wind_effect: 'helped' | 'neutral' | 'hurt' | null
    multi_swell_effect: 'helped' | 'neutral' | 'hurt' | null
  }
}

type AnalysisContext = {
  comment: string
  spot: { id: string; name: string }
  conditions: Record<string, unknown>
}

const enums = {
  effect: ['better', 'worse', 'neutral'],
  size: ['smaller_than_expected', 'as_expected', 'bigger_than_expected'],
  surface: ['clean', 'mixed', 'messy'],
  consistency: ['low', 'normal', 'high'],
  observedEffect: ['helped', 'neutral', 'hurt'],
} as const

function outputText(payload: any) {
  for (const item of payload?.output ?? []) for (const content of item?.content ?? []) {
    if (content?.type === 'output_text' && typeof content.text === 'string') return content.text
  }
  return ''
}

export function validateSurfCommentAnalysis(value: unknown): SurfCommentAnalysis | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as any
  if (Object.keys(v).some((key) => !['summary', 'confidence', 'drivers', 'observations'].includes(key))) return null
  if (typeof v.summary !== 'string' || v.summary.length > 160 || !Number.isFinite(v.confidence) || v.confidence < 0 || v.confidence > 1 || !Array.isArray(v.drivers)) return null
  if (!v.observations || typeof v.observations !== 'object') return null
  if (Object.keys(v.observations).some((key) => !['forecast_size_relation', 'surface_quality', 'consistency', 'wind_effect', 'multi_swell_effect'].includes(key))) return null
  const allowedDimensions = new Set<string>(SURF_COMMENT_DRIVER_DIMENSIONS)
  const drivers = v.drivers.every((d: any) => d && Object.keys(d).every((key) => ['dimension', 'effect', 'strength'].includes(key)) && allowedDimensions.has(d.dimension) && enums.effect.includes(d.effect) && Number.isFinite(d.strength) && d.strength >= 0 && d.strength <= 1)
  const nullableEnum = (x: unknown, allowed: readonly string[]) => x === null || (typeof x === 'string' && allowed.includes(x))
  if (!drivers || !nullableEnum(v.observations.forecast_size_relation, enums.size) || !nullableEnum(v.observations.surface_quality, enums.surface) || !nullableEnum(v.observations.consistency, enums.consistency) || !nullableEnum(v.observations.wind_effect, enums.observedEffect) || !nullableEnum(v.observations.multi_swell_effect, enums.observedEffect)) return null
  return v as SurfCommentAnalysis
}

export async function analyzeSurfComment(context: AnalysisContext, fetcher: typeof fetch = fetch) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const model = process.env.SURF_COMMENT_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: 'Extract only surf observations explicitly supported by the surfer comment. Conditions are context only: never infer an observation merely because a number is present. Do not calculate or output any rating, score, residual, adjustment, or multiplier. Use null and omit drivers when unsupported. Keep summary under 160 characters. Write the summary in the same natural language as the surfer comment; infer it from the comment and do not translate to match UI language. Use UI language only when the comment has no meaningful linguistic content.' }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(context) }] },
        ],
        text: { format: { type: 'json_schema', name: 'surf_comment_observations', strict: true, schema: {
          type: 'object', additionalProperties: false,
          properties: {
            summary: { type: 'string', maxLength: 160 }, confidence: { type: 'number', minimum: 0, maximum: 1 },
            drivers: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { dimension: { type: 'string', enum: [...SURF_COMMENT_DRIVER_DIMENSIONS] }, effect: { type: 'string', enum: [...enums.effect] }, strength: { type: 'number', minimum: 0, maximum: 1 } }, required: ['dimension', 'effect', 'strength'] } },
            observations: { type: 'object', additionalProperties: false, properties: {
              forecast_size_relation: { anyOf: [{ type: 'string', enum: [...enums.size] }, { type: 'null' }] }, surface_quality: { anyOf: [{ type: 'string', enum: [...enums.surface] }, { type: 'null' }] }, consistency: { anyOf: [{ type: 'string', enum: [...enums.consistency] }, { type: 'null' }] }, wind_effect: { anyOf: [{ type: 'string', enum: [...enums.observedEffect] }, { type: 'null' }] }, multi_swell_effect: { anyOf: [{ type: 'string', enum: [...enums.observedEffect] }, { type: 'null' }] },
            }, required: ['forecast_size_relation', 'surface_quality', 'consistency', 'wind_effect', 'multi_swell_effect'] },
          }, required: ['summary', 'confidence', 'drivers', 'observations'],
        } } }, store: false, max_output_tokens: 500,
      }),
    })
    if (!response.ok) return null
    const parsed = JSON.parse(outputText(await response.json()))
    const analysis = validateSurfCommentAnalysis(parsed)
    return analysis ? { analysis, model } : null
  } catch { return null } finally { clearTimeout(timeout) }
}
