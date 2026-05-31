import { createClient } from '@supabase/supabase-js'
import { decryptJson, encryptJson } from './crypto'
import { fetchSpondItems, SpondError, type SpondCredentials, type SpondMappedItem } from './client'

export const SPOND_PROVIDER = 'spond'
export const SPOND_EXPERIMENTAL_LABEL = 'unofficial_experimental'

const SPOND_SYNC_STALE_MS = 30 * 60 * 1000

type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'reconnect_required'

export function getBearerToken(req: Request) {
  const raw = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

export function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function getAuthenticatedUserId(req: Request) {
  const token = getBearerToken(req)
  if (!token) return null
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

export function publicIntegrationStatus(row: Record<string, unknown> | null) {
  const status = String(row?.status || 'disconnected') as IntegrationStatus
  return {
    provider: SPOND_PROVIDER,
    integration_kind: SPOND_EXPERIMENTAL_LABEL,
    connected: status === 'connected',
    reconnect_required: status === 'reconnect_required',
    status,
    account: row?.external_account_label || null,
    last_sync_at: row?.last_sync_at || null,
    updated_at: row?.updated_at || null,
  }
}

export function spondUserMessage(error: unknown) {
  if (error instanceof SpondError) {
    if (error.code === 'invalid_credentials') return 'Could not connect Spond. Check your username and password.'
    if (error.code === 'verification_required') return 'Spond needs extra verification for this account. This experimental connection cannot complete that step yet.'
    if (error.code === 'rate_limited') return 'Spond is limiting requests right now. Try again later.'
    if (error.code === 'expired') return 'Spond needs to be reconnected.'
    return 'Spond is temporarily unavailable. Try again later.'
  }
  return 'Failed to connect Spond.'
}

export function isSpondReconnectError(error: unknown) {
  return error instanceof SpondError && (error.code === 'expired' || error.code === 'invalid_credentials' || error.code === 'verification_required')
}

function syncErrorLabel(error: unknown) {
  if (error instanceof SpondError) return error.code
  return 'sync_failed'
}

export function shouldSyncSpond(lastSyncAt: unknown, now = Date.now()) {
  if (typeof lastSyncAt !== 'string' || !lastSyncAt) return true
  const last = new Date(lastSyncAt).getTime()
  if (!Number.isFinite(last)) return true
  return now - last >= SPOND_SYNC_STALE_MS
}

export async function syncSpondForUser(userId: string, credentials: SpondCredentials) {
  const supabase = getSupabaseAdmin()
  const result = await fetchSpondItems(credentials)
  const now = new Date().toISOString()

  const rows = result.items.map((item) => ({
    user_id: userId,
    provider: SPOND_PROVIDER,
    external_id: item.external_id,
    title: item.title,
    body: item.body,
    starts_at: item.starts_at,
    due_at: item.due_at,
    priority: item.priority,
    raw: item.raw,
    updated_at: now,
  }))

  const { error: deleteError } = await supabase
    .from('integration_items')
    .delete()
    .eq('user_id', userId)
    .eq('provider', SPOND_PROVIDER)

  if (deleteError) throw new Error(deleteError.message)

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('integration_items')
      .upsert(rows, { onConflict: 'user_id,provider,external_id' })
    if (upsertError) throw new Error(upsertError.message)
  }

  const profile = result.profile || {}
  const first = typeof profile.firstName === 'string' ? profile.firstName : ''
  const last = typeof profile.lastName === 'string' ? profile.lastName : ''
  const email = typeof profile.email === 'string' ? profile.email : credentials.username
  const label = `${first} ${last}`.trim() || email

  const { data, error } = await supabase
    .from('user_integrations')
    .upsert({
      user_id: userId,
      provider: SPOND_PROVIDER,
      status: 'connected',
      encrypted_credentials: encryptJson(credentials),
      external_account_id: typeof profile.id === 'string' ? profile.id : null,
      external_account_label: label,
      last_sync_at: now,
      last_error: null,
      updated_at: now,
    }, { onConflict: 'user_id,provider' })
    .select('provider,status,external_account_label,last_sync_at,updated_at')
    .single()

  if (error) throw new Error(error.message)
  return { integration: data, itemCount: rows.length }
}

export async function markSpondSyncFailure(userId: string, error: unknown) {
  const supabase = getSupabaseAdmin()
  await supabase
    .from('user_integrations')
    .update({
      status: isSpondReconnectError(error) ? 'reconnect_required' : 'connected',
      last_error: syncErrorLabel(error),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', SPOND_PROVIDER)
}

export async function syncSpondFromStoredConnection(userId: string, options: { force?: boolean } = {}) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('user_integrations')
    .select('encrypted_credentials,status,last_sync_at')
    .eq('user_id', userId)
    .eq('provider', SPOND_PROVIDER)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data || data.status !== 'connected') return { connected: false, itemCount: 0, skipped: false }
  if (!options.force && !shouldSyncSpond(data.last_sync_at)) return { connected: data.status === 'connected', itemCount: 0, skipped: true }

  try {
    const credentials = decryptJson<SpondCredentials>(data.encrypted_credentials)
    const result = await syncSpondForUser(userId, credentials)
    return { connected: true, itemCount: result.itemCount, skipped: false }
  } catch (error) {
    await markSpondSyncFailure(userId, error)
    throw error
  }
}

export async function syncSpondIfStaleForUsers(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.map((userId) => userId.trim()).filter(Boolean)))
  return Promise.allSettled(uniqueUserIds.map((userId) => syncSpondFromStoredConnection(userId)))
}

export function itemDateIso(item: Pick<SpondMappedItem, 'starts_at' | 'due_at'> | { starts_at: string | null; due_at: string | null }) {
  return item.starts_at || item.due_at || null
}
