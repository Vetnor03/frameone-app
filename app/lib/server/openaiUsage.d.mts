export type OpenAIUsagePayload = {
  id?: string | null
  usage?: {
    input_tokens?: number | null
    output_tokens?: number | null
    input_tokens_details?: { cached_tokens?: number | null } | null
    output_tokens_details?: { reasoning_tokens?: number | null } | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

export function openAIUsageFields(payload: OpenAIUsagePayload | null | undefined): {
  response_id: string | null
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  usage: Record<string, unknown>
}

export function costControlledModel(configured: unknown, fallback?: string): string
export function reserveBackgroundOpenAICall(feature: string, model: string): Promise<{ allowed: boolean; id: string | null }>
export function completeReservedOpenAICall(id: string | null, payload: OpenAIUsagePayload | null | undefined, status?: 'success' | 'error', errorCode?: string | null): Promise<void>
export function recordOpenAIUsage(feature: string, model: string, payload: OpenAIUsagePayload | null | undefined, status?: 'success' | 'error', errorCode?: string | null): Promise<void>
