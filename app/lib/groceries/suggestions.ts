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
