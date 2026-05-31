import { getSupabaseAdmin } from './spond/server'

export const DISCONNECTABLE_INTEGRATION_PROVIDERS = ['spond', 'teams', 'transponder'] as const

export type DisconnectableIntegrationProvider = (typeof DISCONNECTABLE_INTEGRATION_PROVIDERS)[number]

export function normalizeDisconnectableIntegrationProvider(provider: string): DisconnectableIntegrationProvider | null {
  const normalized = provider.trim().toLowerCase()
  return DISCONNECTABLE_INTEGRATION_PROVIDERS.includes(normalized as DisconnectableIntegrationProvider)
    ? normalized as DisconnectableIntegrationProvider
    : null
}

export async function disconnectIntegrationForUser(userId: string, provider: DisconnectableIntegrationProvider) {
  const supabase = getSupabaseAdmin()

  const { error: itemsError } = await supabase
    .from('integration_items')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider)
  if (itemsError) throw new Error(itemsError.message)

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('user_integrations')
    .upsert({
      user_id: userId,
      provider,
      status: 'disconnected',
      encrypted_credentials: null,
      external_account_id: null,
      external_account_label: null,
      last_sync_at: null,
      last_error: null,
      updated_at: now,
    }, { onConflict: 'user_id,provider' })
  if (error) throw new Error(error.message)

  return { provider, connected: false, status: 'disconnected' as const }
}
