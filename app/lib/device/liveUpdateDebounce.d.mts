export type LatestStateDebouncer = {
  schedule(task: () => void | Promise<void>): void
  cancel(): void
}

export function createLatestStateDebouncer(
  delayMs: number,
  timers?: {
    setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
    clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
  }
): LatestStateDebouncer
