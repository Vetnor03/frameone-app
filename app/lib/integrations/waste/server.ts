import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { providerFor, resolveKartverketAddress, type NormalizedWasteCollection, type ResolvedWasteAddress, type WasteProviderRegistryEntry, type WastePreviewItem } from './providers'

export const WASTE_PROVIDER = 'waste'
export const WASTE_UNSUPPORTED_MESSAGE = 'Denne kommunen støttes ikke enda. Foreløpig støtter vi Stavanger og Sandnes.'

type WasteConnectResult = {
  status: 'connected' | 'unsupported' | 'preview'
  resolvedAddress: ResolvedWasteAddress
  registryEntry?: WasteProviderRegistryEntry
  itemCount?: number
  message?: string
  previewItems?: WastePreviewItem[]
}

const BUILT_IN_WASTE_REGISTRY: Record<string, WasteProviderRegistryEntry> = {
  '1103': { municipality_number: '1103', municipality_name: 'Stavanger', provider: 'stavanger', provider_config: {}, status: 'supported' },
  '1108': { municipality_number: '1108', municipality_name: 'Sandnes', provider: 'hentavfall', provider_config: {}, status: 'supported' },
}

function externalId(provider: string, municipalityNumber: string, addressId: string, item: NormalizedWasteCollection) {
  return `${provider}:${municipalityNumber}:${addressId}:${item.waste_fraction}:${item.date}`
}

function previewItems(collections: NormalizedWasteCollection[], resolvedAddress: ResolvedWasteAddress, registryEntry: WasteProviderRegistryEntry): WastePreviewItem[] {
  const source = registryEntry.provider === 'stavanger' ? 'stavanger' : 'hentavfall'
  return collections.slice(0, 60).map((item) => ({
    date: item.date,
    wasteTypes: [item.title.replace(/^Tøm\s+/i, '')],
    source,
    address: resolvedAddress.label,
    municipality: resolvedAddress.municipalityName || registryEntry.municipality_name,
    title: item.title,
  }))
}

async function registryForAddress(resolvedAddress: ResolvedWasteAddress): Promise<WasteProviderRegistryEntry | null> {
  const supabase = getSupabaseAdmin()
  const { data: registryData, error: registryError } = await supabase
    .from('waste_provider_registry')
    .select('municipality_number, municipality_name, provider, provider_config, status')
    .eq('municipality_number', resolvedAddress.municipalityNumber)
    .maybeSingle()

  if (registryError) throw new Error(registryError.message)
  const registryEntry = registryData as WasteProviderRegistryEntry | null
  return registryEntry || BUILT_IN_WASTE_REGISTRY[resolvedAddress.municipalityNumber] || null
}

async function resolveAndFetch(address: string) {
  console.log('[waste] raw address input', { address })
  const initialAddress = await resolveKartverketAddress(address)
  const registryEntry = await registryForAddress(initialAddress)
  console.log('[waste] registry lookup result', { municipality_number: initialAddress.municipalityNumber, registryEntry })
  if (!registryEntry || registryEntry.status !== 'supported') return { initialAddress, registryEntry: null, resolvedAddress: initialAddress, collections: [] }

  const provider = providerFor(registryEntry.provider)
  if (!provider) throw new Error(`Unsupported waste provider: ${registryEntry.provider}`)
  const resolvedAddress = await provider.resolveAddress(address, registryEntry.provider_config || {})
  if (!resolvedAddress.propertyId && (!resolvedAddress.gnr || !resolvedAddress.bnr)) {
    throw new Error('Fant adressen, men mangler eiendomsinformasjon for tømmekalenderen. Prøv å skrive adressen mer presist.')
  }
  console.log('[waste] selected provider', { provider: registryEntry.provider, resolvedAddress })
  const raw = await provider.fetchCollections(resolvedAddress, registryEntry.provider_config || {})
  const collections = provider.normalizeCollections(raw, registryEntry.provider_config || {})
  console.log('[waste] normalized collections', { provider: registryEntry.provider, parsed_collection_count: collections.length, first5: collections.slice(0, 5) })
  return { initialAddress, registryEntry, resolvedAddress, collections }
}

export async function previewWasteForUser(userId: string, address: string): Promise<WasteConnectResult> {
  const supabase = getSupabaseAdmin()
  const { registryEntry, resolvedAddress, collections } = await resolveAndFetch(address)
  if (!registryEntry) {
    await supabase.from('user_integrations').upsert({ user_id: userId, provider: WASTE_PROVIDER, status: 'disconnected', external_account_label: resolvedAddress.label, last_error: WASTE_UNSUPPORTED_MESSAGE, updated_at: new Date().toISOString() }, { onConflict: 'user_id,provider' })
    return { status: 'unsupported', resolvedAddress, message: WASTE_UNSUPPORTED_MESSAGE }
  }
  return { status: 'preview', resolvedAddress, registryEntry, itemCount: collections.length, previewItems: previewItems(collections, resolvedAddress, registryEntry) }
}

export async function connectWasteForUser(userId: string, address: string): Promise<WasteConnectResult> {
  const supabase = getSupabaseAdmin()
  let fetched: Awaited<ReturnType<typeof resolveAndFetch>>
  try {
    fetched = await resolveAndFetch(address)
  } catch (error: unknown) {
    await supabase.from('user_integrations').upsert({ user_id: userId, provider: WASTE_PROVIDER, status: 'disconnected', last_error: error instanceof Error ? error.message : 'Waste provider fetch failed', updated_at: new Date().toISOString() }, { onConflict: 'user_id,provider' })
    throw error
  }
  const { registryEntry, resolvedAddress, collections } = fetched
  if (!registryEntry) return { status: 'unsupported', resolvedAddress, message: WASTE_UNSUPPORTED_MESSAGE }

  const now = new Date().toISOString()
  const rows = collections.map((item) => ({
    user_id: userId,
    provider: WASTE_PROVIDER,
    external_id: externalId(registryEntry.provider, resolvedAddress.municipalityNumber, resolvedAddress.addressId, item),
    title: item.title,
    body: null,
    starts_at: null,
    due_at: null,
    priority: 5,
    raw: { source: 'waste', type: 'waste_collection', provider: registryEntry.provider, municipality_number: resolvedAddress.municipalityNumber, address_id: resolvedAddress.addressId, waste_fraction: item.waste_fraction, all_day: true, date: item.date, collection: item.raw ?? null },
    updated_at: now,
  }))

  await supabase.from('integration_items').delete().eq('user_id', userId).eq('provider', WASTE_PROVIDER)
  if (rows.length) {
    const { error } = await supabase.from('integration_items').upsert(rows, { onConflict: 'user_id,provider,external_id' })
    if (error) throw new Error(error.message)
  }
  const { error } = await supabase.from('user_integrations').upsert({ user_id: userId, provider: WASTE_PROVIDER, status: 'connected', encrypted_credentials: { address: resolvedAddress }, external_account_id: resolvedAddress.addressId, external_account_label: `${resolvedAddress.label}, ${resolvedAddress.municipalityName}`, last_sync_at: now, last_error: null, updated_at: now }, { onConflict: 'user_id,provider' })
  if (error) throw new Error(error.message)
  return { status: 'connected', resolvedAddress, registryEntry, itemCount: rows.length }
}

export async function getWasteStatus(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('user_integrations').select('status,external_account_label,last_sync_at,last_error').eq('user_id', userId).eq('provider', WASTE_PROVIDER).maybeSingle()
  if (error) throw new Error(error.message)
  return { provider: WASTE_PROVIDER, connected: data?.status === 'connected', status: data?.status || 'disconnected', account: data?.external_account_label || null, last_sync_at: data?.last_sync_at || null, message: data?.last_error || null }
}
