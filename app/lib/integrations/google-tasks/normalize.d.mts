export type GoogleTaskLike = {
  id?: string
  title?: string
  notes?: string
  due?: string
  status?: string
  deleted?: boolean
  hidden?: boolean
}
export type NormalizedGoogleTask = {
  external_id: string
  title: string
  body: string | null
  starts_at: string
  due_at: string
  priority: number
  raw: { source: 'google-tasks'; type: 'task'; all_day: true; date: string }
}
export function normalizeGoogleTask(task: GoogleTaskLike, listId: string): NormalizedGoogleTask | null
