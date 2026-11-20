export type MicrosoftTodoTaskLike = {
  id?: string
  title?: string
  status?: string
  isDeleted?: boolean
  dueDateTime?: { dateTime?: string; timeZone?: string } | null
  isReminderOn?: boolean
  reminderDateTime?: { dateTime?: string; timeZone?: string } | null
  recurrence?: unknown
}
export type MicrosoftTodoNormalizedItem = {
  external_id: string
  title: string
  body: null
  starts_at: string
  due_at: string
  priority: number
  raw: {
    source: 'microsoft-todo'
    type: 'task'
    all_day: boolean
    date: string
    floating_time?: string
    reminder_at?: string
    recurring?: boolean
  }
}
export function normalizeMicrosoftTodoTask(
  task: MicrosoftTodoTaskLike, listId: string, options?: { timeZone?: string }
): MicrosoftTodoNormalizedItem | null
