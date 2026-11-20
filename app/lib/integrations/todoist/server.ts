import { randomBytes, timingSafeEqual } from 'node:crypto'
import { encryptJson, decryptJson } from '@/app/lib/integrations/credentialsCrypto'
import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { integrationSyncDelta } from '@/app/lib/integrations/integrationSyncDelta'
import { exchangeTodoistCode, fetchTodoistProfile, fetchTodoistTasks, refreshTodoistToken, TodoistApiError, type TodoistCredentials } from './client'
import { normalizeTodoistTask } from './normalize.mjs'

export const TODOIST_PROVIDER = 'todoist'
export const TODOIST_OAUTH_COOKIE = 'remind_todoist_oauth'
const OAUTH_MAX_AGE_MS = 15 * 60 * 1000
const STALE_AFTER_MS = 15 * 60 * 1000

type TodoistState = { v: 1; user_id: string; nonce: string; created_at: string }
export function createTodoistOAuthState(userId: string) {
  const nonce = randomBytes(24).toString('base64url')
  const encrypted = encryptJson({ v: 1, user_id: userId, nonce, created_at: new Date().toISOString() } satisfies TodoistState)
  return { state: Buffer.from(JSON.stringify(encrypted), 'utf8').toString('base64url'), nonce }
}
export function verifyTodoistOAuthState(state: string, nonce: string) {
  if (!state || state.length > 2000 || !nonce) throw new Error('Invalid Todoist OAuth state')
  const decoded = decryptJson<TodoistState>(JSON.parse(Buffer.from(state, 'base64url').toString('utf8')))
  const a = Buffer.from(decoded.nonce || '')
  const b = Buffer.from(nonce)
  if (decoded.v !== 1 || !decoded.user_id || !a.length || a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Todoist OAuth browser validation failed')
  const age = Date.now() - Date.parse(decoded.created_at)
  if (!Number.isFinite(age) || age < 0 || age > OAUTH_MAX_AGE_MS) throw new Error('Todoist OAuth request expired')
  return decoded.user_id
}


async function writeTodoistItems(userId: string, credentials: TodoistCredentials) {
  const tasks = await fetchTodoistTasks(credentials.access_token)
  const now = new Date().toISOString()
  const incoming = tasks.map(normalizeTodoistTask).filter((row): row is NonNullable<typeof row> => row !== null)
    .map(row => ({ ...row, user_id: userId, provider: TODOIST_PROVIDER, updated_at: now }))
  if (incoming.length > 3000) throw new Error('Too many Todoist tasks to cache')
  const admin = getSupabaseAdmin()
  const { data: existing, error } = await admin.from('integration_items')
    .select('external_id,title,body,starts_at,due_at,priority,raw')
    .eq('user_id', userId).eq('provider', TODOIST_PROVIDER).limit(3001)
  if (error) throw new Error(error.message)
  if ((existing || []).length > 3000) throw new Error('Todoist cache exceeds safe sync limit')
  const { changed, obsoleteIds } = integrationSyncDelta(incoming, existing || [])
  for (let i = 0; i < changed.length; i += 200) {
    const { error: upsertError } = await admin.from('integration_items')
      .upsert(changed.slice(i, i + 200), { onConflict: 'user_id,provider,external_id' })
    if (upsertError) throw new Error(upsertError.message)
  }
  // Remove completed/deleted tasks only after every API page has been fetched.
  for (let i = 0; i < obsoleteIds.length; i += 200) {
    const { error: deleteError } = await admin.from('integration_items')
      .delete().eq('user_id', userId).eq('provider', TODOIST_PROVIDER)
      .in('external_id', obsoleteIds.slice(i, i + 200))
    if (deleteError) throw new Error(deleteError.message)
  }
  return { count: incoming.length, changed: changed.length, removed: obsoleteIds.length, now }
}

export async function connectTodoistForUser(userId: string, code: string) {
  const credentials = await exchangeTodoistCode(code)
  if (credentials.scope && !credentials.scope.split(/[ ,]+/).includes('data:read')) {
    throw new Error('Todoist did not grant read access')
  }
  const [profile, synced] = await Promise.all([
    fetchTodoistProfile(credentials.access_token).catch(() => ({ id: undefined, full_name: undefined, email: undefined })),
    writeTodoistItems(userId, credentials),
  ])
  const admin = getSupabaseAdmin()
  const accountId = typeof profile.id === 'string' ? profile.id : String(profile.id || '')
  const label = typeof profile.full_name === 'string' && profile.full_name.trim() ? profile.full_name.trim()
    : typeof profile.email === 'string' && profile.email.trim() ? profile.email.trim() : 'Todoist'
  const { error } = await admin.from('user_integrations').upsert({
    user_id: userId,
    provider: TODOIST_PROVIDER,
    status: 'connected',
    encrypted_credentials: encryptJson(credentials),
    external_account_id: accountId || null,
    external_account_label: label.slice(0, 120),
    last_sync_at: synced.now,
    last_error: null,
    updated_at: synced.now,
  }, { onConflict: 'user_id,provider' })
  if (error) throw new Error(error.message)
  return synced
}

// Refresh is single-flight in this server instance. The database compare-and-swap also
// prevents overwriting a refresh token already rotated by another instance.
const inFlight = new Map<string, Promise<TodoistCredentials>>()
async function validTodoistCredentials(userId: string, stored: {encrypted_credentials: unknown}, forceRefresh = false): Promise<TodoistCredentials> {
  const credentials = decryptJson<TodoistCredentials>(stored.encrypted_credentials)
  if (!forceRefresh && Number.isFinite(Date.parse(credentials.expires_at)) && Date.parse(credentials.expires_at) - Date.now() > 120000) return credentials
  const existing = inFlight.get(userId)
  if (existing) return existing
  const promise = (async () => {
    const admin = getSupabaseAdmin()
    const { data: latest, error } = await admin.from('user_integrations')
      .select('encrypted_credentials').eq('user_id', userId).eq('provider', TODOIST_PROVIDER).eq('status', 'connected').maybeSingle()
    if (error || !latest) throw new Error('Todoist connection is missing')
    const previous = decryptJson<TodoistCredentials>(latest.encrypted_credentials)
    if (!forceRefresh && Date.parse(previous.expires_at) - Date.now() > 120000) return previous
    const refreshed = await refreshTodoistToken(previous)
    // A successful refresh must never be lost: do not save a consumed refresh token
    // when Todoist returns 200 in its retry grace window without a refresh_token.
    const { data: saved, error: saveError } = await admin.from('user_integrations')
      .update({ encrypted_credentials: encryptJson(refreshed), updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('provider', TODOIST_PROVIDER).eq('status', 'connected')
      .eq('encrypted_credentials', JSON.stringify(latest.encrypted_credentials))
      .select('id').maybeSingle()
    if (saveError) throw new Error(saveError.message)
    if (saved) return refreshed
    const { data: winner } = await admin.from('user_integrations')
      .select('encrypted_credentials').eq('user_id', userId).eq('provider', TODOIST_PROVIDER).eq('status', 'connected').maybeSingle()
    if (!winner) throw new Error('Todoist connection changed during refresh')
    const newest = decryptJson<TodoistCredentials>(winner.encrypted_credentials)
    if (Date.parse(newest.expires_at) - Date.now() < 60000) throw new Error('Todoist refresh must be retried')
    return newest
  })()
  inFlight.set(userId, promise)
  try { return await promise } finally { if (inFlight.get(userId) === promise) inFlight.delete(userId) }
}

export async function syncTodoistFromStoredConnection(userId: string, options: {force?: boolean} = {}) {
  const admin = getSupabaseAdmin()
  const { data: row, error } = await admin.from('user_integrations')
    .select('status,encrypted_credentials,last_sync_at').eq('user_id', userId).eq('provider', TODOIST_PROVIDER).maybeSingle()
  if (error) throw new Error(error.message)
  if (!row || row.status !== 'connected') return { connected: false, refreshed: false }
  const age = Date.now() - Date.parse(String(row.last_sync_at || ''))
  if (!options.force && Number.isFinite(age) && age >= 0 && age < STALE_AFTER_MS) return { connected: true, refreshed: false }
  try {
    let credentials = await validTodoistCredentials(userId, row)
    let synced
    try {
      synced = await writeTodoistItems(userId, credentials)
    } catch (requestError) {
      if (!(requestError instanceof TodoistApiError) || requestError.status !== 401) throw requestError
      // Token may have expired at the provider despite its stated expiry.
      credentials = await validTodoistCredentials(userId, { encrypted_credentials: encryptJson(credentials) }, true)
      synced = await writeTodoistItems(userId, credentials)
    }
    const { error: updateError } = await admin.from('user_integrations')
      .update({ last_sync_at: synced.now, last_error: null, updated_at: synced.now })
      .eq('user_id', userId).eq('provider', TODOIST_PROVIDER).eq('status', 'connected')
    if (updateError) throw new Error(updateError.message)
    return { connected: true, refreshed: true, itemCount: synced.count }
  } catch (syncError) {
    await admin.from('user_integrations')
      .update({ last_error: syncError instanceof Error ? syncError.message.slice(0, 200) : 'Todoist sync failed' })
      .eq('user_id', userId).eq('provider', TODOIST_PROVIDER)
    throw syncError
  }
}
