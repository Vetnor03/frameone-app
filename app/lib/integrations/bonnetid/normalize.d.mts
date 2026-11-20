export type BonnetidCity = { id: string; name: string; prayerMethod: number; asrMethod: string }
export type BonnetidPrayer = { date: string; name: string; time: string }
export function normalizeBonnetidLocations(payload: unknown): BonnetidCity[]
export function normalizeBonnetidTime(value: unknown): string | null
export function normalizeBonnetidDay(payload: unknown, date: string, asrMethod?: 1 | 2): BonnetidPrayer[]
export function normalizeBonnetidMonth(payload: unknown, year: number, month: number, asrMethod?: 1 | 2): BonnetidPrayer[]
export function bonnetidLocalToIso(date: string, time: string): string | null
export function normalizeIrnLocations(payload: unknown): BonnetidCity[]
export function normalizeIrnPrayerRows(payload: unknown, city: BonnetidCity, dates: string[]): BonnetidPrayer[]
