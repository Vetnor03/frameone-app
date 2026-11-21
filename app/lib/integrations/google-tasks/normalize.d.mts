export type NormalizedGoogleTask = {
  external_id: string
  title: string
  body: null
  starts_at: string
  due_at: string
  priority: 0
  raw: { source: 'google-tasks'; type: 'task'; all_day: true; date: string }
}
export function normalizeGoogleTask(task: { id?: string; title?: string; due?: string; status?: string; deleted?: boolean } | null | undefined, listId: string): NormalizedGoogleTask | null
