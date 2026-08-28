export function createLatestStateDebouncer(delayMs, timers = {}) {
  const setTimer = timers.setTimer ?? ((callback, delay) => setTimeout(callback, delay))
  const clearTimer = timers.clearTimer ?? ((timer) => clearTimeout(timer))
  let pendingTimer = null

  return {
    schedule(task) {
      if (pendingTimer != null) clearTimer(pendingTimer)
      pendingTimer = setTimer(() => {
        pendingTimer = null
        void task()
      }, delayMs)
    },
    cancel() {
      if (pendingTimer != null) clearTimer(pendingTimer)
      pendingTimer = null
    },
  }
}
