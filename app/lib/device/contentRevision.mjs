export function affectedModulesSince({ since, currentRevision, changes, fallback = ['all'] }) {
  if (currentRevision <= since) return []
  const rows = [...(changes ?? [])].sort((a, b) => Number(a.revision) - Number(b.revision))
  const oldestAvailable = Number(rows[0]?.revision ?? currentRevision)
  if (since < oldestAvailable - 1) return ['all']
  const affected = [...new Set(rows.flatMap((row) => Array.isArray(row.changed_modules) ? row.changed_modules : []))]
  return affected.length ? affected : fallback
}
