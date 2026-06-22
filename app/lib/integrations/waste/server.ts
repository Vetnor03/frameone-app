import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { providerFor, resolveKartverketAddress, type NormalizedWasteCollection, type ResolvedWasteAddress, type WasteProviderRegistryEntry } from './providers'

export const WASTE_PROVIDER = 'waste'
export const WASTE_UNSUPPORTED_MESSAGE = 'Denne kommunen støttes ikke enda. Send oss gjerne kommunenavn, så legger vi den til.'

type WasteConnectResult = {
  status: 'connected' | 'unsupported'
  resolvedAddress: ResolvedWasteAddress
  registryEntry?: WasteProviderRegistryEntry
  itemCount?: number
  message?: string
}

function externalId(provider: string, municipalityNumber: string, addressId: string, item: NormalizedWasteCollection) {
  return `${provider}:${municipalityNumber}:${addressId}:${item.waste_fraction}:${item.date}`
}

export async function connectWasteForUser(userId: string, address: string): Promise<WasteConnectResult> {
  const supabase = getSupabaseAdmin()
  console.log('[waste] raw address input', { address })
  const resolvedAddress = await resolveKartverketAddress(address)
  console.log('[waste] resolved address result', {
    resolvedAddress,
    municipality_number: resolvedAddress.municipalityNumber,
    municipality_name: resolvedAddress.municipalityName,
  })

  const { data: registryData, error: registryError } = await supabase
    .from('waste_provider_registry')
    .select('municipality_number, municipality_name, provider, provider_config, status')
    .eq('municipality_number', resolvedAddress.municipalityNumber)
    .maybeSingle()

  if (registryError) throw new Error(registryError.message)
  const registryEntry = registryData as WasteProviderRegistryEntry | null
  console.log('[waste] registry lookup result', {
    municipality_number: resolvedAddress.municipalityNumber,
    registryEntry,
  })
  if (!registryEntry || registryEntry.status !== 'supported') {
    await supabase.from('user_integrations').upsert({
      user_id: userId,
      provider: WASTE_PROVIDER,
      status: 'disconnected',
      external_account_label: resolvedAddress.label,
      last_error: WASTE_UNSUPPORTED_MESSAGE,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' })
    return { status: 'unsupported', resolvedAddress, message: WASTE_UNSUPPORTED_MESSAGE }
  }

  const provider = providerFor(registryEntry.provider)
  if (!provider) throw new Error(`Unsupported waste provider: ${registryEntry.provider}`)
  console.log('[waste] selected provider', { provider: registryEntry.provider })
  let raw: unknown
  try {
    raw = await provider.fetchCollections(resolvedAddress, registryEntry.provider_config || {})
    console.log('[waste] provider fetch result', { provider: registryEntry.provider, raw })
  } catch (error: unknown) {
    console.error('[waste] provider fetch error', {
      provider: registryEntry.provider,
      error: error instanceof Error ? error.message : error,
    })
    await supabase.from('user_integrations').upsert({
      user_id: userId,
      provider: WASTE_PROVIDER,
      status: 'disconnected',
      external_account_id: resolvedAddress.addressId,
      external_account_label: `${resolvedAddress.label}, ${resolvedAddress.municipalityName}`,
      last_error: error instanceof Error ? error.message : 'Waste provider fetch failed',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' })
    throw error
  }
  const collections = provider.normalizeCollections(raw, registryEntry.provider_config || {})
  const now = new Date().toISOString()
  const rows = collections.map((item) => ({
    user_id: userId,
    provider: WASTE_PROVIDER,
    external_id: externalId(registryEntry.provider, resolvedAddress.municipalityNumber, resolvedAddress.addressId, item),
    title: item.title,
    body: null,
    starts_at: `${item.date}T00:00:00+01:00`,
    due_at: `${item.date}T00:00:00+01:00`,
    priority: 5,
    raw: { source: 'waste', type: 'waste_collection', provider: registryEntry.provider, municipality_number: resolvedAddress.municipalityNumber, address_id: resolvedAddress.addressId, waste_fraction: item.waste_fraction, all_day: true, date: item.date, collection: item.raw ?? null },
    updated_at: now,
  }))

  await supabase.from('integration_items').delete().eq('user_id', userId).eq('provider', WASTE_PROVIDER)
  if (rows.length) {
    const { error } = await supabase.from('integration_items').upsert(rows, { onConflict: 'user_id,provider,external_id' })
    if (error) throw new Error(error.message)
  }
  const { error } = await supabase.from('user_integrations').upsert({
    user_id: userId,
    provider: WASTE_PROVIDER,
    status: 'connected',
    encrypted_credentials: { address: resolvedAddress },
    external_account_id: resolvedAddress.addressId,
    external_account_label: `${resolvedAddress.label}, ${resolvedAddress.municipalityName}`,
    last_sync_at: now,
    last_error: null,
    updated_at: now,
  }, { onConflict: 'user_id,provider' })
  if (error) throw new Error(error.message)
  return { status: 'connected', resolvedAddress, registryEntry, itemCount: rows.length }
}

export async function getWasteStatus(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('user_integrations').select('status,external_account_label,last_sync_at,last_error').eq('user_id', userId).eq('provider', WASTE_PROVIDER).maybeSingle()
  if (error) throw new Error(error.message)
  return { provider: WASTE_PROVIDER, connected: data?.status === 'connected', status: data?.status || 'disconnected', account: data?.external_account_label || null, last_sync_at: data?.last_sync_at || null, message: data?.last_error || null }
}
