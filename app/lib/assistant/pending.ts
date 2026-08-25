import { validateParsedReminder, type ParsedReminder, type ReminderParseContext } from '../reminders/parser.ts'

export type PendingReminderPayload = { originalText: string; partial: ParsedReminder; question: string }

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
