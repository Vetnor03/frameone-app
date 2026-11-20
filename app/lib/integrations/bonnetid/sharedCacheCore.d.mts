export type SharedIrnClaim<T> = { state: 'hit'; payload: T[] } | { state: 'claimed'; token: string } | { state: 'pending' | 'cooldown' }
export function withSharedIrnCache<T>(args: {
  key: string
  ttlSeconds: number
  claim: (key: string, ttlSeconds: number) => Promise<SharedIrnClaim<T>>
  publish: (key: string, token: string, payload: T[]) => Promise<boolean>
  fail: (key: string, token: string) => Promise<boolean>
  load: () => Promise<T[]>
  sleep?: (milliseconds: number) => Promise<void>
  maxWaits?: number
}): Promise<T[]>
