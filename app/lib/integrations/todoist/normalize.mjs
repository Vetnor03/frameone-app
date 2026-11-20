// Pure projection of an active Todoist task into the existing reminder cache.
// No undated task is silently assigned a fake due date.
export function normalizeTodoistTask(task) {
  const id = typeof task?.id === 'string' ? task.id.trim() : ''
  const title = typeof task?.content === 'string' ? task.content.trim().slice(0, 300) : ''
  if (!id || id.length > 128 || !title || task.checked === true || task.is_deleted === true) return null
  const due = task.due
  const dateValue = typeof due?.date === 'string' ? due.date : ''
  const datetime = typeof due?.datetime === 'string' ? due.datetime : (/T/.test(dateValue) ? dateValue : '')
  const date = dateValue.slice(0, 10) || (datetime ? datetime.slice(0, 10) : '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const allDay = !datetime
  const startsAt = allDay ? new Date(date + 'T12:00:00Z') : new Date(datetime)
  if (Number.isNaN(startsAt.getTime())) return null
  return {
    external_id: id, title,
    body: null,
    starts_at: startsAt.toISOString(),
    due_at: startsAt.toISOString(),
    priority: 0,
    raw: { source: 'todoist', type: 'task', all_day: allDay, date: allDay ? date : null, recurring: due?.is_recurring === true },
  }
}
