/**
 * Show only the nearest future instance of each IRN prayer/solar event.
 * The caller must filter out events that have already started. Retaining the
 * full stored timetable allows the next day's instance to take over locally
 * at the minute boundary, without another API request.
 */
export function nextBonnetidOccurrences(items, getName, getLocalStart) {
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

/**
 * Combine timed prayers/solar events with date-only Islamic occasions under
 * one IRN source. Only timed entries roll over per event name; occasions
 * remain independent all-day dates, even when multiple share a name.
 */
export function nextBonnetidWithOccasions(items, getName, getDate, getTime) {
  const timed = items.filter(item => getTime(item))
  const occasions = items.filter(item => !getTime(item))
  const upcomingTimes = nextBonnetidOccurrences(timed, getName,
    item => String(getDate(item) || '') + 'T' + String(getTime(item) || ''))
  return [...upcomingTimes, ...occasions].sort((a, b) => {
    const aKey = String(getDate(a) || '') + 'T' + String(getTime(a) || '00:00')
    const bKey = String(getDate(b) || '') + 'T' + String(getTime(b) || '00:00')
    return aKey.localeCompare(bKey) ||
      String(getName(a) || '').localeCompare(String(getName(b) || ''))
  })
}
