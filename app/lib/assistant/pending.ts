import { validateParsedReminder, type ParsedReminder, type ReminderParseContext } from '../reminders/parser.ts'

export type PendingReminderPayload = { originalText: string; partial: ParsedReminder; question: string }
export type PendingSurfPayload = { spot: string; rating: number; date: string; comment: string }

export function validatePendingSurfPayload(value: unknown): PendingSurfPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.spot !== 'string' || !row.spot.trim() || !Number.isInteger(row.rating) || Number(row.rating) < 1 || Number(row.rating) > 6 || typeof row.date !== 'string' || typeof row.comment !== 'string') return null
  return { spot: row.spot.trim(), rating: Number(row.rating), date: row.date.trim(), comment: row.comment.trim() }
}

export function surfFollowupTime(answer: string) {
  const match = answer.trim().match(/(?:^|\b)(?:at|kl\.?|around|rundt|ca\.?)?\s*(\d{1,2})(?:(?::|\.)(\d{2}))?\s*$/i)
  if (!match || Number(match[1]) > 23 || Number(match[2] || 0) > 59) return null
  return `${match[1].padStart(2, '0')}:${(match[2] || '00').padStart(2, '0')}`
}

export function validatePendingReminderPayload(value: unknown): PendingReminderPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const partial = validateParsedReminder(row.partial)
  if (!partial || typeof row.originalText !== 'string' || !row.originalText.trim() || row.originalText.length > 1_000 || typeof row.question !== 'string' || !row.question.trim() || row.question.length > 240) return null
  return { originalText: row.originalText.trim(), partial, question: row.question.trim() }
}

export function reminderFollowupContext(pending: PendingReminderPayload, answer: string, context: Pick<ReminderParseContext, 'localNow' | 'timezone' | 'language'>): ReminderParseContext | null {
  const cleanAnswer = answer.trim()
  if (!cleanAnswer || cleanAnswer.length > 1_000) return null
  return { text: pending.originalText, partial: pending.partial, clarificationQuestion: pending.question, clarificationAnswer: cleanAnswer, ...context }
}
