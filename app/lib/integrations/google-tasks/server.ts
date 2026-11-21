import { decryptJson, encryptJson } from '@/app/lib/integrations/credentialsCrypto'
import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { integrationSyncDelta } from '@/app/lib/integrations/integrationSyncDelta'
import { refreshGoogleToken, type GoogleCredentials, type GoogleTokenSet } from '@/app/lib/integrations/google-calendar/client'
import { normalizeTimeZone } from '@/app/lib/integrations/teams/server'
import { fetchGoogleTaskListsAndTasks, googleTasksAccountEmail, GOOGLE_TASKS_SCOPES, GoogleTasksApiError } from './client'
import { normalizeGoogleTask } from './normalize.mjs'

export const GOOGLE_TASKS_PROVIDER = 'google-tasks'
export const GOOGLE_TASKS_OAUTH_COOKIE = 'remind_google_tasks_oauth'
const STALE_MS = 15 * 60 * 1000

/** Keep unverified sensitive scopes away from public OAuth requests. */
export function googleTasksAllowedForUser(userId: string): boolean {
  if (process.env.GOOGLE_TASKS_PUBLIC_ENABLED === 'true') return true
  return !!userId && (process.env.GOOGLE_TASKS_TEST_USER_IDS || '').split(',')
    .map(id => id.trim()).filter(Boolean).includes(userId)
}

export function googleTasksStatus(row: Record<string, unknown> | null) {
  const connected = row?.status === 'connected'
  const legacyLabel = typeof row?.external_account_label === 'string' ? row.external_account_label.trim() : ''
  const account = legacyLabel && legacyLabel !== 'Google Tasks' ? legacyLabel : null
  return {
    provider: GOOGLE_TASKS_PROVIDER,
    connected,
    status: row?.status || 'disconnected',
    account,
    account_reconnect_required: connected && !account,
    last_sync_at: row?.last_sync_at || null,
  }
}

function requireTaskScope(tokens: GoogleTokenSet) {
  if (tokens.scope && !tokens.scope.split(/\s+/).includes(GOOGLE_TASKS_SCOPES[0])) {
    throw new Error('Google did not grant Google Tasks read-only permission')
  }
}

async function saveTasks(userId: string, credentials: GoogleCredentials) {
  const fetched = await fetchGoogleTaskListsAndTasks(credentials.access_token)
  const now = new Date().toISOString()
  const rows = fetched.map(({listId, task}) => normalizeGoogleTask(task, listId))
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .map(item => ({...item, user_id: userId, provider: GOOGLE_TASKS_PROVIDER, updated_at: now}))
  const supabase = getSupabaseAdmin()
  const {data: previous, error} = await supabase.from('integration_items')
    .select('external_id,title,body,starts_at,due_at,priority,raw')
    .eq('user_id', userId).eq('provider', GOOGLE_TASKS_PROVIDER).limit(3001)
  if (error) throw new Error(error.message)
  if ((previous || []).length > 3000) throw new Error('Google Tasks cache exceeds safe limit')
  const {changed, obsoleteIds} = integrationSyncDelta(rows, previous || [])
  // Avoid no-op updates, which unnecessarily wake physical frames.
  for (let i = 0; i < changed.length; i += 200) {
    const {error: writeError} = await supabase.from('integration_items')
      .upsert(changed.slice(i, i+200), {onConflict: 'user_id,provider,external_id'})
    if (writeError) throw new Error(writeError.message)
  }
  for (let i = 0; i < obsoleteIds.length; i += 200) {
    const {error: removeError} = await supabase.from('integration_items')
      .delete().eq('user_id',userId).eq('provider',GOOGLE_TASKS_PROVIDER)
      .in('external_id',obsoleteIds.slice(i,i+200))
    if (removeError) throw new Error(removeError.message)
  }
  return {count:rows.length,updated:changed.length,removed:obsoleteIds.length,now}
}

export async function connectGoogleTasksForUser(userId: string, tokens: GoogleTokenSet, timeZone: string) {
  if (!googleTasksAllowedForUser(userId)) throw new Error('Google Tasks is awaiting Google verification')
  requireTaskScope(tokens)
  if (!tokens.refresh_token) throw new Error('Google did not provide offline access. Try reconnecting.')
  const credentials: GoogleCredentials = {...tokens, time_zone: normalizeTimeZone(timeZone)}
  const [synced, accountEmail] = await Promise.all([
    saveTasks(userId, credentials),
    googleTasksAccountEmail(tokens.access_token, tokens.scope),
  ])
  const {error} = await getSupabaseAdmin().from('user_integrations').upsert({
    user_id:userId,provider:GOOGLE_TASKS_PROVIDER,status:'connected',
    encrypted_credentials:encryptJson(credentials),
    external_account_id:null,external_account_label:accountEmail,
    last_sync_at:synced.now,last_error:null,updated_at:synced.now,
  },{onConflict:'user_id,provider'})
  if (error) throw new Error(error.message)
  return synced
}

const syncFlights = new Map<string,Promise<{connected:boolean;refreshed:boolean;itemCount?:number}>>()
export async function syncGoogleTasksFromStoredConnection(userId: string, options: {force?:boolean}={}) {
  if (!googleTasksAllowedForUser(userId)) return {connected:false,refreshed:false}
  const inflight = syncFlights.get(userId)
  if (inflight) return inflight
  const operation = (async () => {
    const supabase = getSupabaseAdmin()
    const {data,error} = await supabase.from('user_integrations')
      .select('status,encrypted_credentials,last_sync_at')
      .eq('user_id',userId).eq('provider',GOOGLE_TASKS_PROVIDER).maybeSingle()
    if (error) throw new Error(error.message)
    if (data?.status !== 'connected' || !data.encrypted_credentials) return {connected:false,refreshed:false}
    const age = Date.now() - Date.parse(String(data.last_sync_at || ''))
    if (!options.force && Number.isFinite(age) && age >= 0 && age < STALE_MS) return {connected:true,refreshed:false}
    try {
      let credentials = decryptJson<GoogleCredentials>(data.encrypted_credentials)
      if (Date.parse(credentials.expires_at) - Date.now() < 120000) {
        const newToken = await refreshGoogleToken(credentials)
        credentials = {...credentials,...newToken}
        requireTaskScope(credentials)
        const {error: tokenError} = await supabase.from('user_integrations')
          .update({encrypted_credentials:encryptJson(credentials),updated_at:new Date().toISOString()})
          .eq('user_id',userId).eq('provider',GOOGLE_TASKS_PROVIDER).eq('status','connected')
        if (tokenError) throw new Error(tokenError.message)
      }
      let synced
      try { synced = await saveTasks(userId,credentials) }
      catch (err) {
        if (!(err instanceof GoogleTasksApiError) || err.status !== 401) throw err
        const newToken = await refreshGoogleToken(credentials)
        credentials = {...credentials,...newToken}
        requireTaskScope(credentials)
        const {error: tokenError} = await supabase.from('user_integrations')
          .update({encrypted_credentials:encryptJson(credentials),updated_at:new Date().toISOString()})
          .eq('user_id',userId).eq('provider',GOOGLE_TASKS_PROVIDER).eq('status','connected')
        if (tokenError) throw new Error(tokenError.message)
        synced = await saveTasks(userId,credentials)
      }
      const {error: syncError} = await supabase.from('user_integrations')
        .update({last_sync_at:synced.now,last_error:null,updated_at:synced.now})
        .eq('user_id',userId).eq('provider',GOOGLE_TASKS_PROVIDER).eq('status','connected')
      if (syncError) throw new Error(syncError.message)
      return {connected:true,refreshed:true,itemCount:synced.count}
    } catch(error) {
      await supabase.from('user_integrations')
        .update({last_error:'Google Tasks sync failed'})
        .eq('user_id',userId).eq('provider',GOOGLE_TASKS_PROVIDER)
      throw error
    }
  })()
  syncFlights.set(userId,operation)
  try {return await operation}finally{if(syncFlights.get(userId)===operation)syncFlights.delete(userId)}
}
