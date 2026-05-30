import { createClient } from '@supabase/supabase-js'
import { decryptJson, encryptJson } from './crypto'
import { fetchSpondItems, type SpondCredentials, type SpondMappedItem } from './client'

export const SPOND_PROVIDER = 'spond'

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
  return {
    provider: SPOND_PROVIDER,
    connected: row?.status === 'connected',
    status: row?.status || 'disconnected',
    account: row?.external_account_label || null,
    last_sync_at: row?.last_sync_at || null,
    updated_at: row?.updated_at || null,
  }
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

export async function syncSpondFromStoredConnection(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('user_integrations')
    .select('encrypted_credentials,status')
    .eq('user_id', userId)
    .eq('provider', SPOND_PROVIDER)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data || data.status !== 'connected') return { connected: false, itemCount: 0 }

  const credentials = decryptJson<SpondCredentials>(data.encrypted_credentials)
  const result = await syncSpondForUser(userId, credentials)
  return { connected: true, itemCount: result.itemCount }
}

export function itemDateIso(item: Pick<SpondMappedItem, 'starts_at' | 'due_at'> | { starts_at: string | null; due_at: string | null }) {
  return item.starts_at || item.due_at || null
}
