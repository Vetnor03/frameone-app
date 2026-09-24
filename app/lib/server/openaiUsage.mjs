import { createClient } from '@supabase/supabase-js'

let adminClient

function getAdminClient() {
  if (adminClient !== undefined) return adminClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  adminClient = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
  return adminClient
}

function int(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

export function openAIUsageFields(payload) {
  const usage = payload?.usage && typeof payload.usage === 'object' ? payload.usage : {}
  const inputDetails = usage?.input_tokens_details && typeof usage.input_tokens_details === 'object' ? usage.input_tokens_details : {}
  const outputDetails = usage?.output_tokens_details && typeof usage.output_tokens_details === 'object' ? usage.output_tokens_details : {}
  return {
    response_id: typeof payload?.id === 'string' ? payload.id : null,
    input_tokens: int(usage.input_tokens),
    cached_input_tokens: int(inputDetails.cached_tokens),
    output_tokens: int(usage.output_tokens),
    reasoning_tokens: int(outputDetails.reasoning_tokens),
    usage,
  }
}

function envLimit(name, fallback) {
  const raw = process.env[name]
  if (raw == null || raw.trim() === '') return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback
}

export async function reserveBackgroundOpenAICall(feature, model) {
  const db = getAdminClient()
  if (!db) return { allowed: true, id: null }
  try {
    const { data, error } = await db.rpc('reserve_openai_background_call', {
      p_feature: feature,
      p_model: model,
      p_daily_limit: envLimit('OPENAI_BACKGROUND_DAILY_CALL_LIMIT', 96),
      p_monthly_limit: envLimit('OPENAI_BACKGROUND_MONTHLY_CALL_LIMIT', 2000),
    })
    if (error) throw error
    return { allowed: Boolean(data), id: typeof data === 'string' ? data : null }
  } catch (error) {
    console.warn('[openai-usage] background reservation failed; skipping AI', { feature, code: error?.code || 'unknown' })
    return { allowed: false, id: null }
  }
}

export async function completeReservedOpenAICall(id, payload, status = 'success', errorCode = null) {
  if (!id) return
  const db = getAdminClient()
  if (!db) return
  const fields = openAIUsageFields(payload)
  try {
    await db.from('openai_usage_events').update({
      status,
      ...fields,
      error_code: errorCode,
      completed_at: new Date().toISOString(),
    }).eq('id', id)
  } catch {
    // Cost telemetry must never break the product path.
  }
}

export async function recordOpenAIUsage(feature, model, payload, status = 'success', errorCode = null) {
  const db = getAdminClient()
  if (!db) return
  const fields = openAIUsageFields(payload)
  try {
    await db.from('openai_usage_events').insert({
      feature,
      model,
      background: false,
      status,
      ...fields,
      error_code: errorCode,
      completed_at: new Date().toISOString(),
    })
  } catch {
    // Cost telemetry must never break the product path.
  }
}
