// Google Tasks: read-only, date-only tasks. No write requests.
export const GOOGLE_TASKS_SCOPES = ['https://www.googleapis.com/auth/tasks.readonly'] as const
const TASKS_API_ROOT = 'https://tasks.googleapis.com/tasks/v1'

export type GoogleTasksEntry = {
  id?: string
  title?: string
  due?: string
  status?: string
  deleted?: boolean
}
export type GoogleTaskList = { id?: string; title?: string }

export class GoogleTasksApiError extends Error {
  constructor(public readonly status: number) { super('Google Tasks API failed (' + status + ')') }
}

async function fetchGooglePages<T>(token: string, path: string, maxPages: number): Promise<T[]> {
  let nextPageToken: string | undefined
  const results: T[] = []
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(TASKS_API_ROOT + path)
    url.searchParams.set('maxResults', '100')
    if (nextPageToken) url.searchParams.set('pageToken', nextPageToken)
    const response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) throw new GoogleTasksApiError(response.status)
    const json = await response.json().catch(() => ({})) as { items?: T[]; nextPageToken?: string }
    if (json.items !== undefined && !Array.isArray(json.items)) throw new Error('Invalid Google Tasks response')
    results.push(...(json.items || []))
    nextPageToken = typeof json.nextPageToken === 'string' && json.nextPageToken ? json.nextPageToken : undefined
    if (!nextPageToken) return results
  }
  throw new Error('Google Tasks pagination limit reached; existing tasks preserved')
}

export async function fetchGoogleTaskListsAndTasks(token: string) {
  const lists = await fetchGooglePages<GoogleTaskList>(token, '/users/@me/lists', 3)
  if (lists.length > 150) throw new Error('Google Tasks list limit exceeded')
  const entries: Array<{ listId: string; listName: string; task: GoogleTasksEntry }> = []
  for (const list of lists) {
    if (!list.id) continue
    const path = '/lists/' + encodeURIComponent(list.id) + '/tasks?showCompleted=false&showDeleted=false&showHidden=false'
    const tasks = await fetchGooglePages<GoogleTasksEntry>(token, path, 30)
    for (const task of tasks) entries.push({ listId: list.id, listName: list.title || 'Tasks', task })
    if (entries.length > 3000) throw new Error('Too many Google Tasks to sync')
  }
  return entries
}
