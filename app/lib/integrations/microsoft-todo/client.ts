import type { MicrosoftTodoTaskLike } from './normalize.mjs'

const GRAPH = 'https://graph.microsoft.com/v1.0'
export const MICROSOFT_TODO_SCOPES = ['offline_access', 'Tasks.Read', 'User.Read'] as const

export class MicrosoftTodoApiError extends Error {
  constructor(public readonly status: number) {
    super('Microsoft To Do API failed (' + status + ')')
  }
}

// Microsoft returns absolute @odata.nextLink values. Never follow URLs to another host.
async function graphPages<T>(accessToken: string, path: string, maxPages: number): Promise<T[]> {
  let nextUrl: string | null = GRAPH + path
  const items: T[] = []
  for (let page = 0; nextUrl && page < maxPages; page++) {
    const url: URL = new URL(nextUrl)
    if (url.protocol !== 'https:' || url.hostname !== 'graph.microsoft.com' || !url.pathname.startsWith('/v1.0/me/todo/')) {
      throw new Error('Unexpected Microsoft Graph pagination URL')
    }
    const response = await fetch(url.toString(), {
      headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) throw new MicrosoftTodoApiError(response.status)
    const json = await response.json().catch(() => ({})) as {
      value?: T[]
      '@odata.nextLink'?: string
    }
    if (!Array.isArray(json.value)) throw new Error('Invalid Microsoft To Do response')
    items.push(...json.value)
    nextUrl = typeof json['@odata.nextLink'] === 'string' ? json['@odata.nextLink'] : null
    if (!nextUrl) return items
  }
  throw new Error('Microsoft To Do pagination limit reached; existing tasks preserved')
}

type GraphList = { id?: string; displayName?: string }
export async function fetchMicrosoftTodoListsAndTasks(accessToken: string) {
  const lists = await graphPages<GraphList>(accessToken, '/me/todo/lists?$top=100', 3)
  if (lists.length > 150) throw new Error('Too many Microsoft To Do lists to sync')
  const tasks: Array<{ listId: string; listName: string; task: MicrosoftTodoTaskLike }> = []
  for (const list of lists) {
    if (typeof list.id !== 'string' || !list.id) continue
    const path = '/me/todo/lists/' + encodeURIComponent(list.id) + '/tasks?$top=100'
    const entries = await graphPages<MicrosoftTodoTaskLike>(accessToken, path, 30)
    for (const task of entries) tasks.push({ listId: list.id, listName: list.displayName || 'Tasks', task })
    if (tasks.length > 3000) throw new Error('Too many Microsoft To Do tasks to sync')
  }
  return tasks
}
