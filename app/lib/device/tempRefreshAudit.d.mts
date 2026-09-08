// TEMP_REFRESH_AUDIT temporary declarations for the isolated ingestion helper.
export type TEMP_REFRESH_AUDIT_Record = Record<string, unknown> & { event_seq: number }
export const TEMP_REFRESH_AUDIT_ENABLED: boolean
export const TEMP_REFRESH_AUDIT_DECISIONS: Set<string>
export function TEMP_REFRESH_AUDIT_classify(record: Record<string, unknown>): string
export function TEMP_REFRESH_AUDIT_sanitize(record: unknown): TEMP_REFRESH_AUDIT_Record | null
export function TEMP_REFRESH_AUDIT_prepareBatch(records: unknown, enabled?: boolean): { error: string | null, records: TEMP_REFRESH_AUDIT_Record[] }
