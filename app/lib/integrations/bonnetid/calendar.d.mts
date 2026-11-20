export type IrnCalendarOccasion = { id: string; date: string; kind: 'month_start' | 'annual_event'; year: number; month: number; day: number; no: string; en: string; ar: string }
export function normalizeIrnMonthStarts(payload: unknown): Array<{ day: number; month: number; year: number; date: string; remark: string | null }>
export function normalizeIrnMonthLabels(payload: unknown): Array<{ month: number; no: string; en: string; ar: string; short: string; long: string }>
export function normalizeIrnAnnualEvents(payload: unknown): Array<{ month: number; day: number; no: string; en: string; ar: string }>
export function buildIrnCalendarOccurrences(input: { mapping: unknown; months: unknown; events: unknown; today: string; horizonEnd: string }): IrnCalendarOccasion[]
