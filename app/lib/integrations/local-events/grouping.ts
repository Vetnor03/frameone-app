/**
 * Shared between the Events app, frame feed, and authenticated server routes.
 * An event's performances share one group only when title and venue match.
 * Keys intentionally exclude date and ticket provider.
 */
export type EventGroupingItem = {
  id: string
  title: string
  date: string
  time?: string | null
  venue?: string | null
  source?: string | null
}

function normalize(value: string) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('nb-NO')
    .replace(/[\u2018\u2019\u201c\u201d]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

function hash(value: string) {
  // Two independent 32-bit streams avoid relying on Node-only crypto in the browser.
  let a = 2166136261
  let b = 2246822519
  for (const char of value) {
    const code = char.codePointAt(0) || 0
    a = Math.imul(a ^ code, 16777619)
    b = Math.imul(b ^ code, 2246822519)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}

export function localEventGroupKey(title: string, venue: string | null | undefined, source?: string | null) {
  const name = normalize(title)
  const place = normalize(venue || '')
  if (!name) return ''
  // Missing venue: prefer conservative grouping within one provider only.
  const key = name + '|' + (place || ('unknown:' + normalize(source || 'unknown')))
  return 'eg1_' + hash(key)
}

export function localEventGroupKeyFromRaw(row: { title?: string | null; raw?: Record<string, unknown> | null }) {
  const raw = row.raw || {}
  const original = typeof raw.title === 'string' && raw.title.trim() ? raw.title : row.title || ''
  const venue = typeof raw.venue === 'string' ? raw.venue : ''
  const source = typeof raw.eventSource === 'string' ? raw.eventSource : ''
  return localEventGroupKey(original, venue, source)
}

export function groupUpcomingEvents<T extends EventGroupingItem>(items: readonly T[], nowYmd: string, nowTime: string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue
    if (item.date < nowYmd || (item.date === nowYmd && item.time && item.time < nowTime)) continue
    const key = localEventGroupKey(item.title, item.venue, item.source) || item.id
    groups.set(key, [...(groups.get(key) || []), item])
  }
  return [...groups.entries()]
    .map(([groupKey, alternatives]) => ({
      groupKey,
      performances: alternatives.sort((a, b) =>
        (a.date + ' ' + (a.time || '')).localeCompare(b.date + ' ' + (b.time || '')) || a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => (a.performances[0].date + a.performances[0].time)
      .localeCompare(b.performances[0].date + b.performances[0].time))
}

export function groupSkipId(groupKey: string) {
  return 'group:' + groupKey
}
