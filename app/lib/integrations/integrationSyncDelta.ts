/**
 * Compare the event fields we persist rather than their sync timestamp.
 * PostgREST may return UTC offsets while providers send equivalent Z timestamps.
 * Avoiding no-op writes matters: each integration_items UPDATE/DELETE/INSERT
 * triggers a physical-frame content revision.
 */
export type IntegrationSyncItem = {
  external_id: string
  title?: string | null
  body?: string | null
  starts_at?: string | null
  due_at?: string | null
  priority?: number | null
  raw?: unknown
}

function timeKey(value: string | null | undefined) {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : value
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, stableJson(nested)]))
  }
  return value ?? null
}

function comparable(item: IntegrationSyncItem) {
  return JSON.stringify({
    title: item.title ?? null,
    body: item.body ?? null,
    starts_at: timeKey(item.starts_at),
    due_at: timeKey(item.due_at),
    priority: Number(item.priority ?? 0),
    raw: stableJson(item.raw),
  })
}

export function integrationSyncDelta<T extends IntegrationSyncItem>(
  incoming: readonly T[],
  stored: readonly IntegrationSyncItem[],
) {
  const existingById = new Map(stored.map(row => [String(row.external_id), row]))
  const incomingIds = new Set<string>()
  const changed: T[] = []
  for (const row of incoming) {
    const id = String(row.external_id || '')
    if (!id) continue
    incomingIds.add(id)
    const existing = existingById.get(id)
    if (!existing || comparable(existing) !== comparable(row)) changed.push(row)
  }
  const obsoleteIds = [...existingById.keys()].filter(id => id && !incomingIds.has(id))
  return { changed, obsoleteIds }
}

export function changedIntegrationRows<T extends IntegrationSyncItem>(
  incoming: readonly T[],
  stored: readonly IntegrationSyncItem[],
): T[] {
  return integrationSyncDelta(incoming, stored).changed
}
