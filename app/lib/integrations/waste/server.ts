import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { providerForAddress, searchKartverketAddresses, WasteProviderError, wasteCollectionTitle, type WasteAddress, type WasteCollection } from './providers'
import { norwayLocalYmd } from './date'
import { wasteCachePlan } from './cache'
import { wasteCollectionDisplayTitle, type WasteDisplayLanguage } from './display.ts'
export { norwayLocalYmd } from './date'

export const WASTE_PROVIDER = 'waste'
export const WASTE_UNSUPPORTED_MESSAGE = 'Waste collection isn’t available for this address yet.'

const externalId = (address: WasteAddress, item: WasteCollection) => `${address.municipalityNumber}:${address.addressId}:${item.date}:${item.normalizedType}`

export function wasteRows(userId: string, address: WasteAddress, collections: WasteCollection[], boundaryDate = norwayLocalYmd()) {
  const grouped = new Map<string, WasteCollection[]>()
  for (const item of collections) {
    if (item.date < boundaryDate) continue
    const list = grouped.get(item.date) || []
    if (!list.some(x => x.normalizedType === item.normalizedType && x.originalLabel === item.originalLabel)) list.push(item)
    grouped.set(item.date, list)
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => {
    const uniqueTypes = [...new Set(items.map(x => x.normalizedType))]
    const title = uniqueTypes.map((type, index) => {
      const value = wasteCollectionTitle(type, items.find(x => x.normalizedType === type)?.originalLabel)
      return index ? value.toLocaleLowerCase('nb-NO') : value
    }).join(' + ')
    return {
      user_id: userId, provider: WASTE_PROVIDER, external_id: externalId(address, { ...items[0], date, normalizedType: uniqueTypes.join('+') as any }),
      title, body: null, starts_at: null, due_at: null, priority: 5,
      raw: { source: 'waste', type: 'waste_collection', date, collection_date: date, all_day: true, normalized_type: uniqueTypes, original_provider_label: items.map(x => x.originalLabel), provider: address.municipalityNumber === '1103' ? 'stavanger' : address.municipalityNumber === '1108' ? 'hentavfall' : 'min_renovasjon', address_id: address.addressId, municipality_number: address.municipalityNumber, collection: items.map(x => x.raw ?? null) },
      updated_at: new Date().toISOString(),
    }
  })
}

async function fetchForAddress(address: WasteAddress) {
  const provider = providerForAddress(address)
  if (!provider.canHandle(address)) throw new WasteProviderError('unsupported', WASTE_UNSUPPORTED_MESSAGE, false)
  const resolved = await provider.resolveAddress(address)
  return { resolved, collections: provider.normalizeCollections(await provider.fetchCollections(resolved)) }
}

export async function refreshWasteForUser(userId: string, address?: WasteAddress) {
  const db = getSupabaseAdmin()
  let selected = address
  if (!selected) {
    const { data, error } = await db.from('user_integrations').select('encrypted_credentials').eq('user_id', userId).eq('provider', WASTE_PROVIDER).eq('status', 'connected').maybeSingle()
    if (error) throw new Error(error.message)
    selected = data?.encrypted_credentials?.address as WasteAddress | undefined
  }
  if (!selected) throw new WasteProviderError('unsupported', WASTE_UNSUPPORTED_MESSAGE, false)
  try {
    const { resolved, collections } = await fetchForAddress(selected)
    const rows = wasteRows(userId, resolved, collections)
    if (!rows.length) throw new WasteProviderError('invalid_response', 'The provider returned no future waste collections.')
    const boundaryDate = norwayLocalYmd()
    const { data: previous, error: previousError } = await db.from('integration_items').select('external_id').eq('user_id', userId).eq('provider', WASTE_PROVIDER).gte('raw->>date', boundaryDate)
    if (previousError) throw new Error(previousError.message)
    const { error: upsertError } = await db.from('integration_items').upsert(rows, { onConflict: 'user_id,provider,external_id' })
    if (upsertError) throw new Error(upsertError.message)
    const plan = wasteCachePlan((previous || []).map(row => row.external_id), rows.map(row => row.external_id), true)
    if (plan.staleIds.length) {
      const { error: deleteError } = await db.from('integration_items').delete().eq('user_id', userId).eq('provider', WASTE_PROVIDER).in('external_id', plan.staleIds)
      if (deleteError) throw new Error(deleteError.message)
    }
    const now = new Date().toISOString()
    const { error } = await db.from('user_integrations').upsert({ user_id: userId, provider: WASTE_PROVIDER, status: 'connected', encrypted_credentials: { address: resolved }, external_account_id: resolved.addressId, external_account_label: resolved.label, last_sync_at: now, last_success_at: now, last_error: null, last_error_at: null, last_error_code: null, updated_at: now }, { onConflict: 'user_id,provider' })
    if (error) throw new Error(error.message)
    return { status: 'connected' as const, resolvedAddress: resolved, itemCount: rows.length, previewItems: rows.slice(0, 3).map(row => ({ date: row.raw.date, title: row.title })) }
  } catch (error) {
    const providerError = error instanceof WasteProviderError ? error : new WasteProviderError('temporary_failure', error instanceof Error ? error.message : 'Waste refresh failed.')
    await db.from('user_integrations').update({ last_error: providerError.message, last_error_at: new Date().toISOString(), last_error_code: providerError.code, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('provider', WASTE_PROVIDER)
    throw providerError
  }
}

export async function previewWasteAddress(address: WasteAddress, language: WasteDisplayLanguage = 'en') {
  const { resolved, collections } = await fetchForAddress(address)
  return { status: 'preview' as const, resolvedAddress: resolved, previewItems: wasteRows('preview', resolved, collections).slice(0, 3).map(row => ({ date: row.raw.date, title: wasteCollectionDisplayTitle(row.raw.normalized_type, language, row.raw.original_provider_label) })) }
}

export async function searchWasteAddresses(query: string) { return searchKartverketAddresses(query) }
export async function connectWasteForUser(userId: string, address: WasteAddress) { return refreshWasteForUser(userId, address) }

export async function disconnectWasteForUser(userId: string) {
  const db = getSupabaseAdmin()
  const [items, integration] = await Promise.all([db.from('integration_items').delete().eq('user_id', userId).eq('provider', WASTE_PROVIDER), db.from('user_integrations').delete().eq('user_id', userId).eq('provider', WASTE_PROVIDER)])
  if (items.error || integration.error) throw new Error(items.error?.message || integration.error?.message)
}

export async function getWasteStatus(userId: string) {
  const { data, error } = await getSupabaseAdmin().from('user_integrations').select('status,external_account_label,last_sync_at,last_success_at,last_error,last_error_code').eq('user_id', userId).eq('provider', WASTE_PROVIDER).maybeSingle()
  if (error) throw new Error(error.message)
  return { provider: WASTE_PROVIDER, connected: data?.status === 'connected', status: data?.status || 'disconnected', account: data?.external_account_label || null, last_sync_at: data?.last_sync_at || null, last_success_at: data?.last_success_at || null, message: data?.last_error || null, error_code: data?.last_error_code || null }
}

export async function syncAllWasteUsers() {
  const { data, error } = await getSupabaseAdmin().from('user_integrations').select('user_id').eq('provider', WASTE_PROVIDER).eq('status', 'connected')
  if (error) throw new Error(error.message)
  const results = await Promise.allSettled((data || []).map(row => refreshWasteForUser(row.user_id)))
  return { processed: results.length, succeeded: results.filter(x => x.status === 'fulfilled').length, failed: results.filter(x => x.status === 'rejected').length }
}
