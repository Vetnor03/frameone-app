/**
 * Show only the nearest future instance of each AlAdhan prayer/solar event.
 * The caller must filter out events that have already started. Retaining the
 * full stored timetable allows the next day's instance to take over locally
 * at the minute boundary, without another API request.
 */
export function nextAladhanOccurrences(items, getName, getLocalStart) {
  const firstByName = new Map()
  for (const item of items) {
    const name = String(getName(item) || '').trim().toLocaleLowerCase('nb-NO')
    const start = String(getLocalStart(item) || '')
    if (!name || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(start)) continue
    const existing = firstByName.get(name)
    if (!existing || start < existing.start) firstByName.set(name, { item, name, start })
  }
  return [...firstByName.values()]
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))
    .map(entry => entry.item)
}
