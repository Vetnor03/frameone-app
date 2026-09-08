// TEMP_REFRESH_AUDIT: isolated temporary validation/classification used by the
// authenticated physical-device ingestion route. Remove with the audit system.
export const TEMP_REFRESH_AUDIT_ENABLED = process.env.TEMP_REFRESH_AUDIT_ENABLED === 'true'

export const TEMP_REFRESH_AUDIT_DECISIONS = new Set([
  'filtered_change', 'useful_redraw', 'wasted_redraw', 'no_redraw', 'avoidable_wake',
])

type AuditRecord = Record<string, unknown>

export function TEMP_REFRESH_AUDIT_classify(record: AuditRecord): string {
  if (record.physical_refresh === true) return record.render_changed === false ? 'wasted_redraw' : 'useful_redraw'
  if (record.render_changed === false && record.backend_revision_before !== record.backend_revision_after) return 'filtered_change'
  return 'no_redraw'
}

export function TEMP_REFRESH_AUDIT_sanitize(record: unknown): AuditRecord | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null
  const input = record as AuditRecord
  const text = (key: string, max = 512) => typeof input[key] === 'string' ? String(input[key]).slice(0, max) : null
  const refreshType = text('refresh_type', 16)
  if (!['none', 'partial', 'full'].includes(refreshType ?? '')) return null
  const renderChanged = typeof input.render_changed === 'boolean' ? input.render_changed : null
  const physicalRefresh = typeof input.physical_refresh === 'boolean' ? input.physical_refresh : false
  const sanitized: AuditRecord = {
    firmware_version: text('firmware_version', 64), trigger: text('trigger', 64) ?? 'other',
    source: text('source', 128), module: text('module', 128),
    raw_changes: input.raw_changes ?? {}, display_changes: input.display_changes ?? {},
    previous_render_hash: text('previous_render_hash', 128), new_render_hash: text('new_render_hash', 128),
    render_changed: renderChanged, physical_refresh: physicalRefresh, refresh_type: refreshType,
    dirty_regions: Array.isArray(input.dirty_regions) ? input.dirty_regions.slice(0, 16) : [],
    decision_reason: text('decision_reason'),
    backend_revision_before: Number.isSafeInteger(input.backend_revision_before) ? input.backend_revision_before : null,
    backend_revision_after: Number.isSafeInteger(input.backend_revision_after) ? input.backend_revision_after : null,
    battery_percent: typeof input.battery_percent === 'number' ? input.battery_percent : null,
    battery_voltage: typeof input.battery_voltage === 'number' ? input.battery_voltage : null,
    charger_connected: typeof input.charger_connected === 'boolean' ? input.charger_connected : null,
    wake_reason: text('wake_reason', 64), metadata: input.metadata ?? {},
  }
  sanitized.decision = TEMP_REFRESH_AUDIT_classify(sanitized)
  return sanitized
}

// TEMP_REFRESH_AUDIT: pure helper for tests/callers; it never opens a session.
export function TEMP_REFRESH_AUDIT_prepareBatch(records: unknown[], networkSessionActive: boolean) {
  if (!TEMP_REFRESH_AUDIT_ENABLED || !networkSessionActive) return []
  return records.slice(0, 8).map(TEMP_REFRESH_AUDIT_sanitize).filter((record): record is AuditRecord => record !== null)
}
