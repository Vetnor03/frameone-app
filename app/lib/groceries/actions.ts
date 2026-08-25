import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeGrocerySuggestionKey } from './suggestions.ts'

export type CanonicalGroceryAddition = { name: string; quantity?: number; category?: string }

export function normalizeCanonicalGroceryAdditions(items: CanonicalGroceryAddition[]) {
  const unique = new Map<string, Required<CanonicalGroceryAddition>>()
  for (const item of items) {
    const name = item.name.trim().replace(/\s+/g, ' ')
    const key = normalizeGrocerySuggestionKey(name)
    if (!key || name.length > 80 || unique.has(key)) continue
    unique.set(key, { name, quantity: Math.max(1, Math.round(Number(item.quantity) || 1)), category: item.category || 'other' })
  }
  return [...unique.values()]
}

/** Canonical transactional add path shared by Groceries and external action surfaces. */
export async function addGroceryItemsCanonical(client: SupabaseClient, deviceId: string, items: CanonicalGroceryAddition[], requestId: string) {
  const normalized = normalizeCanonicalGroceryAdditions(items)
  if (!normalized.length) throw new Error('invalid_grocery_items')
  const { data, error } = await client.rpc('add_grocery_items_canonical', { p_device_id: deviceId, p_items: normalized, p_request_id: requestId })
  if (error || !data?.ok) throw new Error('grocery_add_failed')
  return { count: normalized.length, itemIds: Array.isArray(data.item_ids) ? data.item_ids as string[] : [] }
}
