// Google Tasks API exposes a due DATE only. Its RFC3339 time component must
// not be interpreted as a task reminder time or converted to a local timezone.
export function normalizeGoogleTask(task, listId) {
  const id = typeof task?.id === 'string' ? task.id.trim() : ''
  const title = typeof task?.title === 'string' ? task.title.trim().slice(0, 300) : ''
  const date = typeof task?.due === 'string' ? task.due.slice(0, 10) : ''
  if (!id || !listId || !title || task.status === 'completed' || task.deleted === true) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z'))) return null
  const startsAt = date + 'T12:00:00.000Z'
  return {
    external_id: listId + ':' + id,
    title,
    body: null,
    starts_at: startsAt,
    due_at: startsAt,
    priority: 0,
    raw: { source: 'google-tasks', type: 'task', all_day: true, date },
  }
}
