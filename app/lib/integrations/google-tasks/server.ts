import { decryptJson, encryptJson } from '@/app/lib/integrations/credentialsCrypto'
import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { integrationSyncDelta } from '@/app/lib/integrations/integrationSyncDelta'
import {
  fetchGoogleTaskListsAndTasks, refreshGoogleTasksToken, GOOGLE_TASKS_SCOPE,
  GoogleTasksApiError, type GoogleTasksCredentials, type GoogleTasksTokenSet,
} from './client'

export const GOOGLE_TASKS_PROVIDER = 'google-tasks'
export const GOOGLE_TASKS_OAUTH_COOKIE = 'remind_google_tasks_oauth'
const STALE_MS = 15 * 60 * 1000

function assertPermission(credentials: GoogleTasksTokenSet) {
  if (credentials.scope && !credentials.scope.split(/\s+/).includes(GOOGLE_TASKS_SCOPE)) {
    throw new Error('Google did not grant read access to Tasks')
  }
}
async function writeTaskItems(userId: string, credentials: GoogleTasksCredentials) {
  const fetched = await fetchGoogleTaskListsAndTasks(credentials.access_token)
  const now = new Date().toISOString()
  const incoming = fetched.map(item => ({
    ...item, user_id: userId, provider: GOOGLE_TASKS_PROVIDER, updated_at: now,
  }))
  const admin = getSupabaseAdmin()
  const { data: previous, error } = await admin.from('integration_items')
    .select('external_id,title,body,starts_at,due_at,priority,raw')
    .eq('user_id', userId).eq('provider', GOOGLE_TASKS_PROVIDER).limit(3001)
  if (error) throw new Error(error.message)
  if ((previous || []).length > 3000) throw new Error('Google Tasks cache exceeds safe limit')
  const { changed, obsoleteIds } = integrationSyncDelta(incoming, previous || [])
  // All provider pages must succeed before removing stale or completed items.
  for (let i = 0; i < changed.length; i += 200) {
    const { error: writeError } = await admin.from('integration_items')
      .upsert(changed.slice(i, i + 200), { onConflict: 'user_id,provider,external_id' })
    if (writeError) throw new Error(writeError.message)
  }
  for (let i = 0; i < obsoleteIds.length; i += 200) {
    const { error: deleteError } = await admin.from('integration_items')
      .delete().eq('user_id', userId).eq('provider', GOOGLE_TASKS_PROVIDER)
      .in('external_id', obsoleteIds.slice(i, i + 200))
    if (deleteError) throw new Error(deleteError.message)
  }
  return { count: incoming.length, updated: changed.length, removed: obsoleteIds.length, now }
}
export async function connectGoogleTasksForUser(userId: string, tokens: GoogleTasksTokenSet) {
  assertPermission(tokens)
  if (!tokens.refresh_token) throw new Error('Google did not provide offline access. Please reconnect.')
  const credentials: GoogleTasksCredentials = tokens
  const result = await writeTaskItems(userId, credentials)
  const { error } = await getSupabaseAdmin().from('user_integrations').upsert({
    user_id: userId, provider: GOOGLE_TASKS_PROVIDER, status: 'connected',
    encrypted_credentials: encryptJson(credentials),
    external_account_id: null, external_account_label: 'Google Tasks',
    last_sync_at: result.now, last_error: null, updated_at: result.now,
  }, { onConflict: 'user_id,provider' })
  if (error) throw new Error(error.message)
  return result
}
const refreshFlights = new Map<string, Promise<GoogleTasksCredentials>>()
async function usableCredentials(userId: string, force = false): Promise<GoogleTasksCredentials> {
  const inflight = refreshFlights.get(userId)
  if (inflight) return inflight
  const operation = (async () => {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin.from('user_integrations')
      .select('encrypted_credentials').eq('user_id', userId).eq('provider', GOOGLE_TASKS_PROVIDER)
      .eq('status', 'connected').maybeSingle()
    if (error || !data?.encrypted_credentials) throw new Error('Google Tasks is not connected')
    const credentials = decryptJson<GoogleTasksCredentials>(data.encrypted_credentials)
    if (!force && Date.parse(credentials.expires_at) - Date.now() > 120000) return credentials
    const refreshed = await refreshGoogleTasksToken(credentials)
    assertPermission(refreshed)
    const updated = { ...credentials, ...refreshed }
    const { error: updateError } = await admin.from('user_integrations')
      .update({ encrypted_credentials: encryptJson(updated), updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('provider', GOOGLE_TASKS_PROVIDER).eq('status', 'connected')
    if (updateError) throw new Error(updateError.message)
    return updated
  })()
  refreshFlights.set(userId, operation)
  try { return await operation }
  finally { if (refreshFlights.get(userId) === operation) refreshFlights.delete(userId) }
}
const syncFlights = new Map<string, Promise<{ connected: boolean; refreshed: boolean; itemCount?: number }>>()
export async function syncGoogleTasksFromStoredConnection(userId: string, options: {force?: boolean} = {}) {
  const inflight = syncFlights.get(userId)
  if (inflight) return inflight
  const operation = (async () => {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin.from('user_integrations')
      .select('status,last_sync_at').eq('user_id', userId)
      .eq('provider', GOOGLE_TASKS_PROVIDER).maybeSingle()
    if (error) throw new Error(error.message)
    if (data?.status !== 'connected') return { connected: false, refreshed: false }
    const elapsed = Date.now() - Date.parse(String(data.last_sync_at || ''))
    if (!options.force && Number.isFinite(elapsed) && elapsed >= 0 && elapsed < STALE_MS) {
      return { connected: true, refreshed: false }
    }
    try {
      let credentials = await usableCredentials(userId)
      let result
      try { result = await writeTaskItems(userId, credentials) }
      catch (error) {
        if (!(error instanceof GoogleTasksApiError) || error.status !== 401) throw error
        credentials = await usableCredentials(userId, true)
        result = await writeTaskItems(userId, credentials)
      }
      const { error: updateError } = await admin.from('user_integrations')
        .update({ last_sync_at: result.now, last_error: null, updated_at: result.now })
        .eq('user_id', userId).eq('provider', GOOGLE_TASKS_PROVIDER).eq('status', 'connected')
      if (updateError) throw new Error(updateError.message)
      return { connected: true, refreshed: true, itemCount: result.count }
    } catch (error) {
      await admin.from('user_integrations')
        .update({ last_error: error instanceof GoogleTasksApiError ? 'Google Tasks API error ' + error.status : 'Google Tasks sync failed' })
        .eq('user_id', userId).eq('provider', GOOGLE_TASKS_PROVIDER)
      throw error
    }
  })()
  syncFlights.set(userId, operation)
  try { return await operation }
  finally { if (syncFlights.get(userId) === operation) syncFlights.delete(userId) }
}
