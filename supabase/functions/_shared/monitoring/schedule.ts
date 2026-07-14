export type MonitoringClass = 'long_term' | 'normal' | 'active' | 'urgent'
export type RunStatus = 'no_change' | 'change' | 'uncertain' | 'error'

export const MIN_PAID_MONITORING_INTERVAL_MINUTES = 60
export const DEFAULT_NORMAL_INTERVAL_MINUTES = 12 * 60
export const URGENT_DURATION_MINUTES = 24 * 60

const classes: MonitoringClass[] = ['long_term', 'normal', 'active', 'urgent']

export function normalizeMonitoringClass(value: unknown, originalRequest = ''): MonitoringClass {
  const proposed = classes.includes(value as MonitoringClass) ? value as MonitoringClass : 'normal'
  const text = originalRequest.toLowerCase()
  const vagueUrgent = proposed === 'urgent' && originalRequest.trim().length > 0 && !/\b(now|today|tonight|asap|urgent|immediately|delay|outage|strike|evacuat|emergency|breaking|live|i dag|haster|akutt|umiddelbart|streik|strømbrudd)\b/i.test(text)
  if (vagueUrgent) return 'normal'
  if (proposed === 'active' && /\b(openai|chatgpt)\b/i.test(text) && /\b(major|store|news|updates|nyheter|oppdateringer)\b/i.test(text) && !/\b(outage|down|incident|live|breaking)\b/i.test(text)) return 'normal'
  return proposed
}

export function defaultFirstIntervalMinutes(cls: MonitoringClass) {
  if (cls === 'long_term') return 24 * 60
  if (cls === 'active') return 3 * 60
  if (cls === 'urgent') return 60
  return DEFAULT_NORMAL_INTERVAL_MINUTES
}

export function urgentUntilFrom(now = new Date()) { return new Date(now.getTime() + URGENT_DURATION_MINUTES * 60_000).toISOString() }

export function calculateNextCheck(input: { monitoring_class?: string | null; consecutive_no_change_count?: number | null; urgent_until?: string | null; last_change_at?: string | null; status: RunStatus; createdUpdate?: boolean; suggested_next_check_minutes?: number | null; attempts?: number | null; now?: Date }) {
  const now = input.now ?? new Date()
  let monitoringClass = normalizeMonitoringClass(input.monitoring_class || 'normal')
  if (monitoringClass === 'urgent' && input.urgent_until && new Date(input.urgent_until).getTime() <= now.getTime()) monitoringClass = 'active'
  const previousNoChange = Math.max(0, Number(input.consecutive_no_change_count || 0))
  let noChangeCount = previousNoChange
  let lastChangeAt: string | null | undefined = input.last_change_at ?? null
  let interval = defaultFirstIntervalMinutes(monitoringClass)

  if (input.status === 'error') {
    interval = Math.min(24 * 60, Math.pow(2, Math.min(Number(input.attempts || 1), 8)) * 5)
  } else if (input.status === 'change' && input.createdUpdate) {
    noChangeCount = 0
    lastChangeAt = now.toISOString()
    interval = monitoringClass === 'long_term' ? 12 * 60 : monitoringClass === 'normal' ? 3 * 60 : monitoringClass === 'urgent' ? 60 : 2 * 60
  } else if (input.status === 'uncertain') {
    noChangeCount = previousNoChange + 1
    interval = monitoringClass === 'active' || monitoringClass === 'urgent' ? 2 * 60 : 6 * 60
    if (noChangeCount > 2) interval = Math.max(interval, 12 * 60)
  } else {
    noChangeCount = previousNoChange + 1
    if (monitoringClass === 'long_term') interval = noChangeCount >= 4 ? 7 * 24 * 60 : 24 * 60
    else if (monitoringClass === 'active' || monitoringClass === 'urgent') interval = noChangeCount === 1 ? 2 * 60 : noChangeCount === 2 ? 3 * 60 : 6 * 60
    else interval = noChangeCount === 1 ? 3 * 60 : noChangeCount === 2 ? 6 * 60 : noChangeCount === 3 ? 12 * 60 : 24 * 60
  }

  const suggested = Number(input.suggested_next_check_minutes || 0)
  if (suggested && input.status === 'change' && input.createdUpdate && suggested > interval) interval = Math.min(suggested, defaultFirstIntervalMinutes(monitoringClass))
  if (input.status !== 'error') interval = Math.max(MIN_PAID_MONITORING_INTERVAL_MINUTES, interval)
  return { monitoringClass, nextMinutes: interval, consecutiveNoChangeCount: noChangeCount, lastChangeAt, nextCheckAt: new Date(now.getTime() + interval * 60_000).toISOString() }
}
