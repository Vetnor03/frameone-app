export function wasteCachePlan(previousFutureIds: string[], returnedIds: string[], refreshSucceeded: boolean) {
  if (!refreshSucceeded) return { upsertIds: [] as string[], staleIds: [] as string[] }
  const upsertIds = [...new Set(returnedIds)]
  const returned = new Set(upsertIds)
  return { upsertIds, staleIds: [...new Set(previousFutureIds)].filter(id => !returned.has(id)) }
}
