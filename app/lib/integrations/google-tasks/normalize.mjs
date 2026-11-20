// Google Tasks stores due dates, not reliable reminder times. Preserve the date
// returned by Google rather than converting UTC midnight to a local time zone.
const DATE = /^\d{4}-\d{2}-\d{2}$/
export function normalizeGoogleTask(task, listId) {
  const id = typeof task?.id === 'string' ? task.id.trim() : ''
  const title = typeof task?.title === 'string' ? task.title.trim().slice(0, 300) : ''
  if (!id || !title || !listId || task?.status === 'completed' || task?.deleted === true || task?.hidden === true) return null
  const date = typeof task.due === 'string' ? task.due.slice(0, 10) : ''
  if (!DATE.test(date) || Number.isNaN(Date.parse(date + 'T12:00:00Z')) ||
      new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date) return null
  const startsAt = date + 'T12:00:00.000Z'
  return {
    external_id: listId + ':' + id,
    title,
    body: typeof task.notes === 'string' ? task.notes.trim().slice(0, 2000) || null : null,
    starts_at: startsAt,
    due_at: startsAt,
    priority: 0,
    raw: { source: 'google-tasks', type: 'task', all_day: true, date },
  }
}
