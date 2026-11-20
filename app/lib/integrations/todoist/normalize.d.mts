export type NormalizedTodoistTask = {
  external_id: string
  title: string
  body: null
  starts_at: string
  due_at: string
  priority: number
  raw: { source: 'todoist'; type: 'task'; all_day: boolean; date: string | null; recurring: boolean }
}
export declare function normalizeTodoistTask(task: {
  id?: string; content?: string; checked?: boolean; is_deleted?: boolean
  due?: { date?: string; datetime?: string; is_recurring?: boolean } | null
}): NormalizedTodoistTask | null
