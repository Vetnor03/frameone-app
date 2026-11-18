export type AladhanHoliday = {
  key: string
  title: string
  day: number
  month: number
  year: number
  date: string
  hijriDate: string
}
export const HIJRI_OBSERVANCES: readonly { key: string; title: string; day: number; month: number }[]
export function hijriYearFromDate(value: unknown): number | null
export function hijriHolidayUrl(observance: { key: string; day: number; month: number }, year: number): string
export function normalizeHijriHoliday(payload: unknown, observance: { key: string; title: string; day: number; month: number }, year: number): AladhanHoliday | null
export function getAladhanHolidayDates(
  hijriDate: string,
  todayYmd: string,
  request?: typeof fetch
): Promise<{ dates: AladhanHoliday[]; complete: boolean }>
