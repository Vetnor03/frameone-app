import { randomBytes, timingSafeEqual } from 'node:crypto'
import { decryptJson, encryptJson } from '@/app/lib/integrations/credentialsCrypto'
import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { integrationSyncDelta } from '@/app/lib/integrations/integrationSyncDelta'
import { fetchMicrosoftProfile, refreshMicrosoftToken, type TeamsStoredCredentials, type TeamsTokenSet } from '@/app/lib/integrations/teams/client'
import { fetchMicrosoftTodoListsAndTasks, MICROSOFT_TODO_SCOPES, MicrosoftTodoApiError } from './client'
import { normalizeMicrosoftTodoTask } from './normalize.mjs'

export const MICROSOFT_TODO_PROVIDER = 'microsoft-todo'
export const MICROSOFT_TODO_OAUTH_COOKIE = 'remind_ms_todo_oauth'
const STALE_MS = 15 * 60 * 1000

export function newMicrosoftTodoNonce() {
  return randomBytes(24).toString('base64url')
}

export function verifyMicrosoftTodoNonce(expected: string | undefined, received: string | undefined) {
  if (!expected || !received) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}

function assertTodoPermission(credentials: TeamsTokenSet) {
  if (credentials.scope && !credentials.scope.split(/\s+/).some(permission => permission.toLowerCase() === 'tasks.read')) {
    throw new Error('Microsoft did not grant Tasks.Read permission')
  }
}

async function writeMicrosoftTodoItems(userId: string, credentials: TeamsStoredCredentials) {
  const fetched = await fetchMicrosoftTodoListsAndTasks(credentials.access_token)
  const now = new Date().toISOString()
  const rows = fetched.map(({ listId, task }) => normalizeMicrosoftTodoTask(task, listId, {timeZone: credentials.time_zone}))
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .map(item => ({...item, user_id: userId, provider: MICROSOFT_TODO_PROVIDER, updated_at: now}))
  if (rows.length > 3000) throw new Error('Too many Microsoft To Do reminders to cache')
  const admin = getSupabaseAdmin()
  const { data: previous, error } = await admin.from('integration_items')
    .select('external_id,title,body,starts_at,due_at,priority,raw')
    .eq('user_id', userId).eq('provider', MICROSOFT_TODO_PROVIDER).limit(3001)
  if (error) throw new Error(error.message)
  if ((previous || []).length > 3000) throw new Error('Microsoft To Do cache exceeds safe limit')
  const {changed, obsoleteIds} = integrationSyncDelta(rows, previous || [])
  // Fetch all lists and task pages successfully before deleting completed/removed tasks.
  // Avoid no-op writes: updating integration_items wakes the physical frames.
  for (let i = 0; i < changed.length; i += 200) {
    const {error: writeError} = await admin.from('integration_items')
      .upsert(changed.slice(i,i+200), {onConflict:'user_id,provider,external_id'})
    if (writeError) throw new Error(writeError.message)
  }
  for (let i = 0; i < obsoleteIds.length; i += 200) {
    const {error: removeError} = await admin.from('integration_items')
      .delete().eq('user_id',userId).eq('provider',MICROSOFT_TODO_PROVIDER)
      .in('external_id', obsoleteIds.slice(i,i+200))
    if (removeError) throw new Error(removeError.message)
  }
  return {count:rows.length, updated:changed.length, removed:obsoleteIds.length, now}
}

export async function connectMicrosoftTodoForUser(userId:string, tokens:TeamsTokenSet, timeZone:string) {
  assertTodoPermission(tokens)
  const credentials:TeamsStoredCredentials = {...tokens, time_zone:timeZone}
  const profile = await fetchMicrosoftProfile(credentials.access_token)
  const synced = await writeMicrosoftTodoItems(userId, credentials)
  const account = String(profile.displayName || profile.mail || profile.userPrincipalName || 'Microsoft To Do')
  const {error} = await getSupabaseAdmin().from('user_integrations').upsert({
    user_id:userId, provider:MICROSOFT_TODO_PROVIDER, status:'connected',
    encrypted_credentials:encryptJson(credentials),
    external_account_id:typeof profile.id==='string'?profile.id:null,
    external_account_label:account.slice(0,120),
    last_sync_at:synced.now, last_error:null, updated_at:synced.now,
  },{onConflict:'user_id,provider'})
  if (error) throw new Error(error.message)
  return synced
}

const refreshFlights = new Map<string,Promise<TeamsStoredCredentials>>()
async function usableCredentials(userId:string, force=false):Promise<TeamsStoredCredentials> {
  const inflight=refreshFlights.get(userId)
  if (inflight) return inflight
  const operation=(async()=>{
    const admin=getSupabaseAdmin()
    const {data,error}=await admin.from('user_integrations').select('encrypted_credentials')
      .eq('user_id',userId).eq('provider',MICROSOFT_TODO_PROVIDER).eq('status','connected').maybeSingle()
    if (error || !data?.encrypted_credentials) throw new Error('Microsoft To Do is not connected')
    const stored=decryptJson<TeamsStoredCredentials>(data.encrypted_credentials)
    if (!force && Date.parse(stored.expires_at)-Date.now()>120000) return stored
    const refreshed=await refreshMicrosoftToken(stored, MICROSOFT_TODO_SCOPES)
    const updated={...stored,...refreshed}
    assertTodoPermission(updated)
    const {data:saved,error:saveError}=await admin.from('user_integrations')
      .update({encrypted_credentials:encryptJson(updated),updated_at:new Date().toISOString()})
      .eq('user_id',userId).eq('provider',MICROSOFT_TODO_PROVIDER).eq('status','connected')
      .eq('encrypted_credentials',JSON.stringify(data.encrypted_credentials))
      .select('id').maybeSingle()
    if (saveError) throw new Error(saveError.message)
    if (saved) return updated
    const {data:winner}=await admin.from('user_integrations').select('encrypted_credentials')
      .eq('user_id',userId).eq('provider',MICROSOFT_TODO_PROVIDER).eq('status','connected').maybeSingle()
    if (!winner?.encrypted_credentials) throw new Error('Microsoft To Do connection changed during refresh')
    const current=decryptJson<TeamsStoredCredentials>(winner.encrypted_credentials)
    if (Date.parse(current.expires_at)-Date.now()<60000) throw new Error('Microsoft token refresh must be retried')
    return current
  })()
  refreshFlights.set(userId,operation)
  try{return await operation}finally{if(refreshFlights.get(userId)===operation)refreshFlights.delete(userId)}
}

const syncFlights = new Map<string,Promise<{connected:boolean;refreshed:boolean;itemCount?:number}>>()
export async function syncMicrosoftTodoFromStoredConnection(userId:string, options:{force?:boolean}={}) {
  const existing=syncFlights.get(userId)
  if (existing) return existing
  const operation=(async()=>{
    const admin=getSupabaseAdmin()
    const {data:connection,error}=await admin.from('user_integrations')
      .select('status,last_sync_at').eq('user_id',userId).eq('provider',MICROSOFT_TODO_PROVIDER).maybeSingle()
    if(error)throw new Error(error.message)
    if(connection?.status!=='connected')return {connected:false,refreshed:false}
    const age=Date.now()-Date.parse(String(connection.last_sync_at||''))
    if(!options.force&&Number.isFinite(age)&&age>=0&&age<STALE_MS)return {connected:true,refreshed:false}
    try{
      let credentials=await usableCredentials(userId)
      let synced
      try{synced=await writeMicrosoftTodoItems(userId,credentials)}
      catch(e){
        if(!(e instanceof MicrosoftTodoApiError)||e.status!==401)throw e
        credentials=await usableCredentials(userId,true)
        synced=await writeMicrosoftTodoItems(userId,credentials)
      }
      const {error:updateError}=await admin.from('user_integrations')
        .update({last_sync_at:synced.now,last_error:null,updated_at:synced.now})
        .eq('user_id',userId).eq('provider',MICROSOFT_TODO_PROVIDER).eq('status','connected')
      if(updateError)throw new Error(updateError.message)
      return {connected:true,refreshed:true,itemCount:synced.count}
    }catch(error){
      await admin.from('user_integrations')
        .update({last_error:error instanceof MicrosoftTodoApiError?'Microsoft Graph error '+error.status:'Microsoft To Do sync failed'})
        .eq('user_id',userId).eq('provider',MICROSOFT_TODO_PROVIDER)
      throw error
    }
  })()
  syncFlights.set(userId,operation)
  try{return await operation}finally{if(syncFlights.get(userId)===operation)syncFlights.delete(userId)}
}
