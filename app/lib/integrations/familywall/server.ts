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

async function commitRows(userId: string, expectedRevision: string | null, credentials: Credentials, rows: Awaited<ReturnType<typeof fetchRows>>) {
  const db = getSupabaseAdmin()
  const { data: previous, error } = await db.from('integration_items').select('external_id,title,body,starts_at,due_at,priority,raw')
    .eq('user_id', userId).eq('provider', FAMILYWALL_PROVIDER).limit(2001)
  if (error || (previous || []).length > 2000) throw new Error('Could not load FamilyWall cache')
  const { changed, obsoleteIds } = integrationSyncDelta(rows, previous || [])
  const { data, error: writeError } = await db.rpc('commit_familywall_sync', {
    p_user_id: userId, p_expected_revision: expectedRevision, p_credentials: encryptJson(credentials),
    p_changed: changed, p_obsolete_ids: obsoleteIds,
  })
  if (writeError) throw new Error('Could not save FamilyWall connection')
  return data === true
}

export async function connectFamilyWall(userId: string, pending: PendingProbe, token: FamilyWallToken) {
  if (!familyWallAllowed(userId)) throw new Error('FamilyWall not available')
  const previous = await connection(userId)
  if (previous?.updated_at && Date.parse(previous.updated_at) > pending.createdAt) throw new Error('FamilyWall connection changed; reconnect')
  const credentials = { ...token, clientId: pending.clientId, tokenEndpoint: pending.tokenEndpoint }
  const rows = await fetchRows(credentials)
  if (!await commitRows(userId, previous?.updated_at || null, credentials, rows)) throw new Error('FamilyWall connection changed; reconnect')
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
    try {
      if (credentials.expires_at && credentials.expires_at <= Date.now() + 60000) {
        credentials = { ...credentials, ...await refreshFamilyWallToken(credentials.clientId, credentials.tokenEndpoint, credentials, origins()) }
      }
      const rows = await fetchRows(credentials)
      if (!await commitRows(userId, data.updated_at, credentials, rows)) return { connected: false, refreshed: false }
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
  const { data, error } = await getSupabaseAdmin().rpc('disconnect_familywall', { p_user_id: userId })
  if (error || data !== true) throw new Error('Could not disconnect FamilyWall')
  return { connected: false }
}
