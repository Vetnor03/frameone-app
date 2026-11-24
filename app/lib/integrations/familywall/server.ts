import { decryptJson, encryptJson } from '../credentialsCrypto'
import { getSupabaseAdmin } from '../spond/server'
import { integrationSyncDelta } from '../integrationSyncDelta'
import { readFamilyWallCalendar, refreshFamilyWallToken, type FamilyWallToken, type PendingProbe } from './probe'
import { normalizeFamilyWallCalendar } from './normalize'

export const FAMILYWALL_PROVIDER = 'familywall'
const STALE_MS = 30 * 60 * 1000
type Credentials = FamilyWallToken & { clientId: string; tokenEndpoint: string }

export function familyWallAllowed(userId: string) {
  return process.env.FAMILYWALL_MCP_PROBE_ENABLED === 'true' &&
    (process.env.FAMILYWALL_MCP_TEST_USER_IDS || '').split(',').map(id => id.trim()).includes(userId)
}
function origins() { return (process.env.FAMILYWALL_MCP_TRUSTED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean) }
async function connection(userId: string) {
  const { data, error } = await getSupabaseAdmin().from('user_integrations').select('status,encrypted_credentials,last_sync_at,updated_at,last_error')
    .eq('user_id', userId).eq('provider', FAMILYWALL_PROVIDER).maybeSingle()
  if (error) throw new Error('Could not load FamilyWall connection')
  return data
}

export async function familyWallStatus(userId: string) {
  if (!familyWallAllowed(userId)) return { eligible: false, connected: false }
  const data = await connection(userId)
  return { eligible: true, connected: data?.status === 'connected', reconnect_required: data?.status === 'error', last_sync_at: data?.last_sync_at || null }
}

async function fetchRows(credentials: Credentials) {
  return normalizeFamilyWallCalendar(await readFamilyWallCalendar(credentials.access_token))
}

async function saveRows(userId: string, rows: Awaited<ReturnType<typeof fetchRows>>, now: string) {
  const db = getSupabaseAdmin()
  const { data: previous, error } = await db.from('integration_items').select('external_id,title,body,starts_at,due_at,priority,raw')
    .eq('user_id', userId).eq('provider', FAMILYWALL_PROVIDER).limit(2001)
  if (error || (previous || []).length > 2000) throw new Error('Could not load FamilyWall cache')
  const incoming = rows.map(row => ({ ...row, user_id: userId, provider: FAMILYWALL_PROVIDER, updated_at: now }))
  const { changed, obsoleteIds } = integrationSyncDelta(incoming, previous || [])
  for (let i = 0; i < changed.length; i += 200) {
    const { error: writeError } = await db.from('integration_items').upsert(changed.slice(i, i + 200), { onConflict: 'user_id,provider,external_id' })
    if (writeError) throw new Error('Could not save FamilyWall events')
  }
  for (let i = 0; i < obsoleteIds.length; i += 200) {
    const { error: removeError } = await db.from('integration_items').delete().eq('user_id', userId).eq('provider', FAMILYWALL_PROVIDER).in('external_id', obsoleteIds.slice(i, i + 200))
    if (removeError) throw new Error('Could not remove old FamilyWall events')
  }
}

export async function connectFamilyWall(userId: string, pending: PendingProbe, token: FamilyWallToken) {
  if (!familyWallAllowed(userId)) throw new Error('FamilyWall not available')
  const credentials = { ...token, clientId: pending.clientId, tokenEndpoint: pending.tokenEndpoint }
  const rows = await fetchRows(credentials)
  const now = new Date().toISOString()
  // Remove the previous authorization before replacing its cache; a newly
  // selected family must not inherit the previous family's cached events.
  const db = getSupabaseAdmin()
  const { error: clearError } = await db.from('user_integrations').upsert({ user_id: userId, provider: FAMILYWALL_PROVIDER, status: 'disconnected', encrypted_credentials: null, external_account_id: null, external_account_label: null, updated_at: now, last_sync_at: null, last_error: null }, { onConflict: 'user_id,provider' })
  if (clearError) throw new Error('Could not replace FamilyWall connection')
  await saveRows(userId, rows, now)
  const { error } = await db.from('user_integrations').update({
    status: 'connected', encrypted_credentials: encryptJson(credentials), external_account_label: 'FamilyWall', last_sync_at: now, updated_at: now, last_error: null,
  }).eq('user_id', userId).eq('provider', FAMILYWALL_PROVIDER).eq('updated_at', now)
  if (error) throw new Error('Could not save FamilyWall connection')
  return { connected: true, itemCount: rows.length }
}

const flights = new Map<string, Promise<{ connected: boolean; refreshed: boolean; itemCount?: number }>>()
export async function syncFamilyWall(userId: string) {
  if (!familyWallAllowed(userId)) return { connected: false, refreshed: false }
  const existing = flights.get(userId)
  if (existing) return existing
  const operation = (async () => {
    const db = getSupabaseAdmin()
    const data = await connection(userId)
    if (data?.status !== 'connected' || !data.encrypted_credentials) return { connected: false, refreshed: false }
    const last = Date.parse(String(data.last_sync_at || ''))
    if (Number.isFinite(last) && Date.now() - last < STALE_MS) return { connected: true, refreshed: false }
    let credentials = decryptJson<Credentials>(data.encrypted_credentials)
    let refreshedToken = false
    try {
      if (credentials.expires_at && credentials.expires_at <= Date.now() + 60000) {
        credentials = { ...credentials, ...await refreshFamilyWallToken(credentials.clientId, credentials.tokenEndpoint, credentials, origins()) }
        refreshedToken = true
      }
      const rows = await fetchRows(credentials)
      // Do not publish fetched rows for a revoked/replaced connection.
      const current = await connection(userId)
      if (current?.status !== 'connected' || current.updated_at !== data.updated_at) return { connected: false, refreshed: false }
      const now = new Date().toISOString()
      if (refreshedToken) {
        const { error } = await db.from('user_integrations').update({ encrypted_credentials: encryptJson(credentials) })
          .eq('user_id', userId).eq('provider', FAMILYWALL_PROVIDER).eq('status', 'connected').eq('updated_at', data.updated_at)
        if (error) throw new Error('Could not save FamilyWall token')
      }
      await saveRows(userId, rows, now)
      const { error } = await db.from('user_integrations').update({ last_sync_at: now, updated_at: now, last_error: null })
        .eq('user_id', userId).eq('provider', FAMILYWALL_PROVIDER).eq('status', 'connected').eq('updated_at', data.updated_at)
      if (error) throw new Error('Could not record FamilyWall sync')
      return { connected: true, refreshed: true, itemCount: rows.length }
    } catch {
      const expired = credentials.expires_at && credentials.expires_at <= Date.now() + 60000
      await db.from('user_integrations').update({ last_error: 'FamilyWall calendar refresh failed', ...(expired ? { status: 'error' } : {}) })
        .eq('user_id', userId).eq('provider', FAMILYWALL_PROVIDER).eq('updated_at', data.updated_at)
      throw new Error('FamilyWall calendar refresh failed')
    }
  })()
  flights.set(userId, operation)
  try { return await operation } finally { if (flights.get(userId) === operation) flights.delete(userId) }
}

export async function disconnectFamilyWall(userId: string) {
  const db = getSupabaseAdmin()
  const { error } = await db.from('user_integrations').upsert({ user_id: userId, provider: FAMILYWALL_PROVIDER, status: 'disconnected', encrypted_credentials: null, external_account_id: null, external_account_label: null, last_sync_at: null, last_error: null, updated_at: new Date().toISOString() }, { onConflict: 'user_id,provider' })
  if (error) throw new Error('Could not disconnect FamilyWall')
  const { error: clearError } = await db.from('integration_items').delete().eq('user_id', userId).eq('provider', FAMILYWALL_PROVIDER)
  if (clearError) throw new Error('Could not clear FamilyWall data')
  return { connected: false }
}
