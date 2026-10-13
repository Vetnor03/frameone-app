export type GrocerySuggestionIdentity = {
  name: string
}

export function normalizeGrocerySuggestionKey(name: string) {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

export function grocerySuggestionKeysMatch(a: string, b: string) {
  const aKey = normalizeGrocerySuggestionKey(a)
  const bKey = normalizeGrocerySuggestionKey(b)
  return !!aKey && aKey === bKey
}

export function findGrocerySuggestionByExactKey<T extends GrocerySuggestionIdentity>(items: T[], name: string): T | null {
  const key = normalizeGrocerySuggestionKey(name)
  if (!key) return null
  return items.find((item) => normalizeGrocerySuggestionKey(item.name) === key) ?? null
}

export function mergeGrocerySuggestionsByExactKey<T extends GrocerySuggestionIdentity & { usageCount: number; lastUsedAt: string | null }>(items: T[]): T[] {
  const byKey = new Map<string, T>()

  for (const item of items) {
    const key = normalizeGrocerySuggestionKey(item.name)
    if (!key) continue
    const normalizedItem = { ...item, name: item.name.trim().replace(/\s+/g, ' ') }
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, normalizedItem)
      continue
    }

    const itemTime = normalizedItem.lastUsedAt ? new Date(normalizedItem.lastUsedAt).getTime() : 0
    const existingTime = existing.lastUsedAt ? new Date(existing.lastUsedAt).getTime() : 0
    byKey.set(key, {
      ...existing,
      ...((itemTime > existingTime || (itemTime === existingTime && normalizedItem.name.length < existing.name.length)) ? { name: normalizedItem.name } : {}),
      usageCount: Math.max(1, existing.usageCount) + Math.max(1, item.usageCount),
      lastUsedAt: itemTime > existingTime ? normalizedItem.lastUsedAt : existing.lastUsedAt,
    })
  }

  return Array.from(byKey.values())
}

/**
 * Match saved items as the user types, putting names that start with the input
 * before substring matches while preserving category, frequency and recency.
 */
export function rankGrocerySuggestionsForInput<T extends GrocerySuggestionIdentity & { category: string; usageCount: number; lastUsedAt: string | null }>(
  items: T[],
  input: string,
  category?: string,
): T[] {
  const query = normalizeGrocerySuggestionKey(input)
  const candidates = items.filter((item) => !query || normalizeGrocerySuggestionKey(item.name).includes(query))
  return candidates.sort((a, b) => {
    if (query) {
      const aStarts = normalizeGrocerySuggestionKey(a.name).startsWith(query) ? 1 : 0
      const bStarts = normalizeGrocerySuggestionKey(b.name).startsWith(query) ? 1 : 0
      if (aStarts !== bStarts) return bStarts - aStarts
    }
    if (category) {
      const aCategory = a.category === category ? 1 : 0
      const bCategory = b.category === category ? 1 : 0
      if (aCategory !== bCategory) return bCategory - aCategory
    }
    if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount
    const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
    const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
    return bTime - aTime
  })
}
