import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { providerFor, resolveKartverketAddress, type NormalizedWasteCollection, type ResolvedWasteAddress, type WasteProviderError, type WasteProviderRegistryEntry, type WastePreviewItem } from './providers'

export const WASTE_PROVIDER = 'waste'
export const WASTE_UNSUPPORTED_MESSAGE = 'Waste collection isn’t available for this address yet.'
export const WASTE_TEMPORARY_MESSAGE = 'We couldn’t load the collection schedule right now. Try again.'
export const WASTE_STALE_MS = 24 * 60 * 60 * 1000

type WasteConnectResult = { status: 'connected' | 'unsupported' | 'preview'; resolvedAddress: ResolvedWasteAddress; registryEntry?: WasteProviderRegistryEntry; itemCount?: number; message?: string; previewItems?: WastePreviewItem[] }
const BUILT_IN_WASTE_REGISTRY: Record<string, WasteProviderRegistryEntry> = {
  '1103': { municipality_number: '1103', municipality_name: 'Stavanger', provider: 'stavanger', provider_config: {}, status: 'supported' },
}
function externalId(provider: string, municipality: string, addressId: string, item: NormalizedWasteCollection) { return `${provider}:${municipality}:${addressId}:${item.waste_fraction}:${item.date}` }
function previewItems(collections: NormalizedWasteCollection[], address: ResolvedWasteAddress, entry: WasteProviderRegistryEntry): WastePreviewItem[] {
  return collections.slice(0, 3).map((item) => ({ date: item.date, wasteTypes: [item.title.replace(/^Tøm\s+/i, '')], source: entry.provider === 'stavanger' ? 'stavanger' : 'hentavfall', address: address.label, municipality: address.municipalityName, title: item.title }))
}
async function registryForAddress(address: ResolvedWasteAddress): Promise<WasteProviderRegistryEntry> {
  const { data, error } = await getSupabaseAdmin().from('waste_provider_registry').select('municipality_number, municipality_name, provider, provider_config, status').eq('municipality_number', address.municipalityNumber).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as WasteProviderRegistryEntry | null) || BUILT_IN_WASTE_REGISTRY[address.municipalityNumber] || { municipality_number: address.municipalityNumber, municipality_name: address.municipalityName, provider: 'min_renovasjon', provider_config: {}, status: 'supported' }
}
async function resolveAndFetch(input: string | ResolvedWasteAddress) {
  const initialAddress = typeof input === 'string' ? await resolveKartverketAddress(input) : input
  const registryEntry = await registryForAddress(initialAddress)
  if (registryEntry.status !== 'supported') return { registryEntry: null, resolvedAddress: initialAddress, collections: [] as NormalizedWasteCollection[] }
  const provider = providerFor(registryEntry.provider)
  if (!provider || !(await provider.canHandle(initialAddress))) return { registryEntry: null, resolvedAddress: initialAddress, collections: [] as NormalizedWasteCollection[] }
  const resolvedAddress = registryEntry.provider === 'min_renovasjon' ? initialAddress : await provider.resolveAddress(initialAddress.label, registryEntry.provider_config)
  const raw = await provider.fetchCollections(resolvedAddress, registryEntry.provider_config)
  const collections = provider.normalizeCollections(raw, registryEntry.provider_config)
  if (!collections.length) return { registryEntry: null, resolvedAddress, collections }
  console.info('[waste] provider sync', { provider: registryEntry.provider, municipality_number: resolvedAddress.municipalityNumber, collection_count: collections.length })
  return { registryEntry, resolvedAddress, collections }
}
function isUnsupported(error: unknown) { return (error as WasteProviderError)?.code === 'unsupported' }
export async function previewWasteForUser(_userId: string, address: string | ResolvedWasteAddress): Promise<WasteConnectResult> {
  try {
    const { registryEntry, resolvedAddress, collections } = await resolveAndFetch(address)
    if (!registryEntry) return { status: 'unsupported', resolvedAddress, message: WASTE_UNSUPPORTED_MESSAGE }
    return { status: 'preview', resolvedAddress, registryEntry, itemCount: collections.length, previewItems: previewItems(collections, resolvedAddress, registryEntry) }
  } catch (error) {
    if (isUnsupported(error)) {
      const resolvedAddress = typeof address === 'string' ? await resolveKartverketAddress(address) : address
      return { status: 'unsupported', resolvedAddress, message: WASTE_UNSUPPORTED_MESSAGE }
    }
    throw error
  }
}
async function storeSuccessfulSync(userId: string, resolvedAddress: ResolvedWasteAddress, entry: WasteProviderRegistryEntry, collections: NormalizedWasteCollection[]) {
  const supabase = getSupabaseAdmin(); const now = new Date().toISOString()
  const rows = collections.map((item) => ({ user_id: userId, provider: WASTE_PROVIDER, external_id: externalId(entry.provider, resolvedAddress.municipalityNumber, resolvedAddress.addressId, item), title: item.title, body: null, starts_at: `${item.date}T00:00:00+01:00`, due_at: null, priority: 5, raw: { source: 'waste', type: 'waste_collection', provider: entry.provider, collection_date: item.date, date: item.date, normalized_type: item.waste_fraction, waste_fraction: item.waste_fraction, all_day: true }, updated_at: now }))
  if (rows.length) { const { error } = await supabase.from('integration_items').upsert(rows, { onConflict: 'user_id,provider,external_id' }); if (error) throw new Error(error.message) }
  const ids = rows.map((row) => row.external_id)
  let staleDelete = supabase.from('integration_items').delete().eq('user_id', userId).eq('provider', WASTE_PROVIDER)
  if (ids.length) staleDelete = staleDelete.not('external_id', 'in', `(${ids.map((id) => `"${id.replaceAll('"', '')}"`).join(',')})`)
  const { error: deleteError } = await staleDelete; if (deleteError) throw new Error(deleteError.message)
  const { error } = await supabase.from('user_integrations').upsert({ user_id: userId, provider: WASTE_PROVIDER, status: 'connected', encrypted_credentials: { address: resolvedAddress, provider: entry.provider, provider_config: entry.provider_config }, external_account_id: resolvedAddress.addressId, external_account_label: resolvedAddress.label, last_sync_at: now, last_success_at: now, last_error: null, last_error_at: null, last_error_code: null, updated_at: now }, { onConflict: 'user_id,provider' })
  if (error) throw new Error(error.message)
  return rows.length
}
export async function connectWasteForUser(userId: string, address: string | ResolvedWasteAddress): Promise<WasteConnectResult> {
  const { registryEntry, resolvedAddress, collections } = await resolveAndFetch(address)
  if (!registryEntry) return { status: 'unsupported', resolvedAddress, message: WASTE_UNSUPPORTED_MESSAGE }
  const itemCount = await storeSuccessfulSync(userId, resolvedAddress, registryEntry, collections)
  return { status: 'connected', resolvedAddress, registryEntry, itemCount, previewItems: previewItems(collections, resolvedAddress, registryEntry) }
}
export async function syncWasteFromStoredConnection(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('user_integrations').select('status,encrypted_credentials,last_sync_at').eq('user_id', userId).eq('provider', WASTE_PROVIDER).maybeSingle()
  if (error || data?.status !== 'connected') return
  if (data.last_sync_at && Date.now() - new Date(data.last_sync_at).getTime() < WASTE_STALE_MS) return
  const address = (data.encrypted_credentials as any)?.address as ResolvedWasteAddress | undefined
  if (!address) return
  try { const fetched = await resolveAndFetch(address); if (fetched.registryEntry) await storeSuccessfulSync(userId, fetched.resolvedAddress, fetched.registryEntry, fetched.collections) }
  catch (syncError) {
    console.warn('[waste] refresh failed; retaining cache', { user_id: userId, code: (syncError as WasteProviderError)?.code || 'temporary' })
    await supabase.from('user_integrations').update({ last_error: WASTE_TEMPORARY_MESSAGE, last_error_at: new Date().toISOString(), last_error_code: (syncError as WasteProviderError)?.code || 'temporary', updated_at: new Date().toISOString() }).eq('user_id', userId).eq('provider', WASTE_PROVIDER)
  }
}
export async function getWasteStatus(userId: string) {
  const { data, error } = await getSupabaseAdmin().from('user_integrations').select('status,external_account_label,last_sync_at,last_error').eq('user_id', userId).eq('provider', WASTE_PROVIDER).maybeSingle()
  if (error) throw new Error(error.message)
  return { provider: WASTE_PROVIDER, connected: data?.status === 'connected', status: data?.status || 'disconnected', account: data?.external_account_label || null, last_sync_at: data?.last_sync_at || null, message: data?.last_error || null }
}
