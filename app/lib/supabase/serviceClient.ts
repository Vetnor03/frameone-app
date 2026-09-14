import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const RETRYABLE_READ_STATUSES = new Set([500, 502, 503, 504])
const READ_RETRY_DELAYS_MS = [150, 500, 1500]

function requestMethod(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
  return method.toUpperCase()
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export async function fetchWithSupabaseReadRetry(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  const method = requestMethod(input, init)
  if (method !== 'GET' && method !== 'HEAD') return fetch(input, init)

  for (let attempt = 0; attempt <= READ_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await delay(READ_RETRY_DELAYS_MS[attempt - 1])

    try {
      const attemptInput = input instanceof Request ? input.clone() : input
      const response = await fetch(attemptInput, init)
      const isLastAttempt = attempt === READ_RETRY_DELAYS_MS.length
      if (!RETRYABLE_READ_STATUSES.has(response.status) || isLastAttempt) return response
    } catch (error) {
      const isLastAttempt = attempt === READ_RETRY_DELAYS_MS.length
      if (isLastAttempt) throw error
    }
  }

  throw new Error('Supabase read retry exhausted unexpectedly')
}

export function createServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        fetch: fetchWithSupabaseReadRetry,
      },
    },
  )
}
