// TEMP_REFRESH_AUDIT: isolated temporary validation/classification used by the
// authenticated physical-device ingestion route. Remove with the audit system.
export const TEMP_REFRESH_AUDIT_ENABLED = process.env.TEMP_REFRESH_AUDIT_ENABLED === 'true'

export const TEMP_REFRESH_AUDIT_DECISIONS = new Set([
  'filtered_change', 'useful_redraw', 'wasted_redraw', 'no_redraw', 'avoidable_wake',
  'intentional_refresh',
])

export function TEMP_REFRESH_AUDIT_classify(record) {
  if (record.metadata?.intentional_refresh === true) return 'intentional_refresh'
  if (record.physical_refresh === true) return record.render_changed === false ? 'wasted_redraw' : 'useful_redraw'
  if (record.render_changed === false && record.backend_revision_before !== record.backend_revision_after) return 'filtered_change'
  return 'no_redraw'
}

export function TEMP_REFRESH_AUDIT_sanitize(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null
  const text = (key, max = 512) => typeof record[key] === 'string' ? String(record[key]).slice(0, max) : null
  const jsonObject = (key, fallback) => record[key] && typeof record[key] === 'object' ? record[key] : fallback
  const refreshType = text('refresh_type', 16)
  if (!['none', 'partial', 'full'].includes(refreshType ?? '')) return null
  const eventSeq = record.event_seq
  if (!Number.isSafeInteger(eventSeq) || eventSeq < 1) return null
  let occurredAt = null
  if (record.occurred_at != null) {
    if (!Number.isSafeInteger(record.occurred_at) || record.occurred_at < 1577836800 || record.occurred_at > 4102444800) return null
    occurredAt = new Date(record.occurred_at * 1000).toISOString()
  }
  const sanitized = {
    event_seq: eventSeq, occurred_at: occurredAt,
    firmware_version: text('firmware_version', 64), trigger: text('trigger', 64) ?? 'other',
    source: text('source', 128), module: text('module', 128),
    raw_changes: jsonObject('raw_changes', {}), display_changes: jsonObject('display_changes', {}),
    previous_render_hash: text('previous_render_hash', 128), new_render_hash: text('new_render_hash', 128),
    render_changed: typeof record.render_changed === 'boolean' ? record.render_changed : null,
    physical_refresh: typeof record.physical_refresh === 'boolean' ? record.physical_refresh : false,
    refresh_type: refreshType,
    dirty_regions: Array.isArray(record.dirty_regions) ? record.dirty_regions.slice(0, 16) : [],
    decision_reason: text('decision_reason'),
    backend_revision_before: Number.isSafeInteger(record.backend_revision_before) ? record.backend_revision_before : null,
    backend_revision_after: Number.isSafeInteger(record.backend_revision_after) ? record.backend_revision_after : null,
    battery_percent: typeof record.battery_percent === 'number' ? record.battery_percent : null,
    battery_voltage: typeof record.battery_voltage === 'number' ? record.battery_voltage : null,
    charger_connected: typeof record.charger_connected === 'boolean' ? record.charger_connected : null,
    wake_reason: text('wake_reason', 64), metadata: jsonObject('metadata', {}),
  }
  sanitized.decision = TEMP_REFRESH_AUDIT_classify(sanitized)
  return sanitized
}

// TEMP_REFRESH_AUDIT: behavioural batch boundary shared by route tests. The
// unique event sequence also makes duplicate records within one resend harmless.
export function TEMP_REFRESH_AUDIT_prepareBatch(records, enabled = TEMP_REFRESH_AUDIT_ENABLED) {
  if (!enabled) return { error: 'disabled', records: [] }
  if (!Array.isArray(records) || records.length < 1 || records.length > 8) return { error: 'invalid_batch', records: [] }
  const sanitized = records.map(TEMP_REFRESH_AUDIT_sanitize)
  if (sanitized.some((record) => record === null)) return { error: 'invalid_record', records: [] }
  const unique = [...new Map(sanitized.map((record) => [record.event_seq, record])).values()]
  return { error: null, records: unique }
}
