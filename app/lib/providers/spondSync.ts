import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { decryptJson } from './crypto'
import { mapSpondEventsToExternalItems, SpondProviderClient, type SpondCredentials, type ExternalReminderItemInput } from './spond'

export type SpondConnectionRow = {
  user_id: string
  provider: string
  status: string | null
  encrypted_credentials: unknown
}

export function createAdminSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase admin environment variables')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function syncSpondForUser(userId: string, supabase = createAdminSupabase()) {
  const { data: connection, error: connectionError } = await supabase
    .from('user_connected_providers')
    .select('user_id, provider, status, encrypted_credentials')
    .eq('user_id', userId)
    .eq('provider', 'spond')
    .maybeSingle()

  if (connectionError) throw new Error(connectionError.message)
  if (!connection || (connection.status !== 'connected' && connection.status !== 'error')) throw new Error('Spond is not connected')

  try {
    const credentials = decryptJson<SpondCredentials>(connection.encrypted_credentials)
    const client = new SpondProviderClient(credentials)
    const events = await client.getUpcomingEvents({ lookaheadDays: 60, maxEvents: 40 })
    const items = mapSpondEventsToExternalItems(events)
    await upsertExternalItems(supabase, userId, items)

    const { error: updateError } = await supabase
      .from('user_connected_providers')
      .update({ status: 'connected', last_sync_at: new Date().toISOString(), error_message: null })
      .eq('user_id', userId)
      .eq('provider', 'spond')

    if (updateError) throw new Error(updateError.message)
    return { ok: true, synced: items.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase
      .from('user_connected_providers')
      .update({ status: 'error', error_message: message, last_sync_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', 'spond')
    throw error
  }
}

async function upsertExternalItems(supabase: SupabaseClient, userId: string, items: ExternalReminderItemInput[]) {
  if (!items.length) return

  for (const item of items) {
    const { data: existing, error: existingError } = await supabase
      .from('external_reminder_items')
      .select('id, title, due_at, dismissed_at')
      .eq('user_id', userId)
      .eq('provider', item.provider)
      .eq('external_id', item.external_id)
      .maybeSingle()

    if (existingError) throw new Error(existingError.message)

    const eventChanged =
      existing?.title !== item.title ||
      (existing?.due_at ? new Date(existing.due_at).toISOString() : null) !== new Date(item.due_at).toISOString()

    const row = {
      user_id: userId,
      provider: item.provider,
      source: item.provider,
      external_id: item.external_id,
      title: item.title,
      text: item.title,
      due_at: item.due_at,
      source_metadata: item.source_metadata,
      dismissed_at: existing?.dismissed_at && !eventChanged ? existing.dismissed_at : null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('external_reminder_items')
      .upsert(row, { onConflict: 'user_id,provider,external_id' })

    if (error) throw new Error(error.message)
  }
}
