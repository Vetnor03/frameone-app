// TEMP_REFRESH_AUDIT: isolated temporary validation/classification used by the
// authenticated physical-device ingestion route. Remove with the audit system.
type TEMP_REFRESH_AUDIT_UnknownRecord = Record<string, unknown>

export type TEMP_REFRESH_AUDIT_Record = TEMP_REFRESH_AUDIT_UnknownRecord & { event_seq: number }

export const TEMP_REFRESH_AUDIT_ENABLED = process.env.TEMP_REFRESH_AUDIT_ENABLED === 'true'

export const TEMP_REFRESH_AUDIT_DECISIONS = new Set([
  'filtered_change', 'useful_redraw', 'wasted_redraw', 'no_redraw', 'avoidable_wake',
  'intentional_refresh', 'display_failed',
])
const TEMP_REFRESH_AUDIT_MIN_VALID_UNIX_TIME = 1577836800 // 2020-01-01 UTC
const TEMP_REFRESH_AUDIT_MAX_VALID_UNIX_TIME = 4102444800 // 2100-01-01 UTC

export function TEMP_REFRESH_AUDIT_classify(record: TEMP_REFRESH_AUDIT_UnknownRecord): string {
  if (record.display_attempted === true && record.display_succeeded === false) return 'display_failed'
  if ((record.metadata as TEMP_REFRESH_AUDIT_UnknownRecord | undefined)?.intentional_refresh === true) return 'intentional_refresh'
  if (record.physical_refresh === true) return record.render_changed === false ? 'wasted_redraw' : 'useful_redraw'
  if (record.render_changed === false && record.backend_revision_before !== record.backend_revision_after) return 'filtered_change'
  const metadata = record.metadata as TEMP_REFRESH_AUDIT_UnknownRecord | undefined
  const confidentlyAvoidableTimerWake = metadata?.avoidable_wake_confident === true &&
    record.trigger === 'scheduled_revision_poll' &&
    record.wake_reason === 'timer' && typeof record.module === 'string' && record.module.length > 0 &&
    record.backend_revision_before === record.backend_revision_after && record.render_changed === false &&
    record.display_attempted === false
  if (confidentlyAvoidableTimerWake) return 'avoidable_wake'
  return 'no_redraw'
}

export function TEMP_REFRESH_AUDIT_sanitize(record: unknown): TEMP_REFRESH_AUDIT_Record | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null
  const input = record as TEMP_REFRESH_AUDIT_UnknownRecord
  const text = (key: string, max = 512): string | null => typeof input[key] === 'string' ? String(input[key]).slice(0, max) : null
  const jsonObject = (key: string, fallback: object): object =>
    input[key] !== null && typeof input[key] === 'object' ? input[key] as object : fallback
  const refreshType = text('refresh_type', 16)
  if (!['none', 'partial', 'full'].includes(refreshType ?? '')) return null
  if (typeof input.display_attempted !== 'boolean') return null
  const displayAttempted = input.display_attempted
  const displaySucceeded = typeof input.display_succeeded === 'boolean' ? input.display_succeeded : null
  const attemptedType = String(input.refresh_type_attempted)
  const physicalRefresh = input.physical_refresh === true
  if (displayAttempted) {
    if (displaySucceeded === null || !['partial', 'full'].includes(attemptedType)) return null
  } else if (displaySucceeded !== null || attemptedType !== 'none') return null
  if (physicalRefresh !== (displayAttempted && displaySucceeded === true)) return null
  if ((physicalRefresh && refreshType !== attemptedType) || (!physicalRefresh && refreshType !== 'none')) return null
  const eventSeq = input.event_seq
  if (typeof eventSeq !== 'number' || !Number.isSafeInteger(eventSeq) || eventSeq < 1) return null
  let occurredAt: string | null = null
  if (input.occurred_at != null) {
    // TEMP_REFRESH_AUDIT: a corrupt RTC must not reject otherwise useful facts.
    // Match firmware bounds and store an invalid device event time as null.
    if (typeof input.occurred_at === 'number' && Number.isSafeInteger(input.occurred_at) &&
        input.occurred_at >= TEMP_REFRESH_AUDIT_MIN_VALID_UNIX_TIME &&
        input.occurred_at <= TEMP_REFRESH_AUDIT_MAX_VALID_UNIX_TIME) {
      occurredAt = new Date(input.occurred_at * 1000).toISOString()
    }
  }
  const sanitized: TEMP_REFRESH_AUDIT_Record = {
    event_seq: eventSeq, occurred_at: occurredAt,
    firmware_version: text('firmware_version', 64), trigger: text('trigger', 64) ?? 'other',
    source: text('source', 128), module: text('module', 128),
    raw_changes: jsonObject('raw_changes', {}), display_changes: jsonObject('display_changes', {}),
    previous_render_hash: text('previous_render_hash', 128), new_render_hash: text('new_render_hash', 128),
    render_changed: typeof input.render_changed === 'boolean' ? input.render_changed : null,
    physical_refresh: physicalRefresh,
    display_attempted: displayAttempted,
    display_succeeded: displaySucceeded,
    refresh_type_attempted: attemptedType,
    refresh_type: refreshType,
    dirty_regions: Array.isArray(input.dirty_regions) ? input.dirty_regions.slice(0, 16) : [],
    decision_reason: text('decision_reason'),
    backend_revision_before: Number.isSafeInteger(input.backend_revision_before) ? input.backend_revision_before : null,
    backend_revision_after: Number.isSafeInteger(input.backend_revision_after) ? input.backend_revision_after : null,
    battery_percent: typeof input.battery_percent === 'number' ? input.battery_percent : null,
    battery_voltage: typeof input.battery_voltage === 'number' ? input.battery_voltage : null,
    charger_connected: typeof input.charger_connected === 'boolean' ? input.charger_connected : null,
    wake_reason: text('wake_reason', 64), metadata: jsonObject('metadata', {}),
  }
  sanitized.decision = TEMP_REFRESH_AUDIT_classify(sanitized)
  return sanitized
}

// TEMP_REFRESH_AUDIT: behavioural batch boundary shared by route tests. The
// unique event sequence also makes duplicate records within one resend harmless.
export function TEMP_REFRESH_AUDIT_prepareBatch(records: unknown, enabled = TEMP_REFRESH_AUDIT_ENABLED): { error: string | null, records: TEMP_REFRESH_AUDIT_Record[] } {
  if (!enabled) return { error: 'disabled', records: [] }
  if (!Array.isArray(records) || records.length < 1 || records.length > 8) return { error: 'invalid_batch', records: [] }
  const sanitized = records.map(TEMP_REFRESH_AUDIT_sanitize)
  if (sanitized.some((record) => record === null)) return { error: 'invalid_record', records: [] }
  const validRecords = sanitized.filter((record): record is TEMP_REFRESH_AUDIT_Record => record !== null)
  const unique = [...new Map(validRecords.map((record) => [record.event_seq, record])).values()]
  return { error: null, records: unique }
}
