export function armFirstDataWatchdog ({
  subscribe,
  onTimeout,
  timeoutMs = 20000,
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  let settled = false
  const timer = setTimer(() => {
    if (settled) return
    settled = true
    onTimeout()
  }, timeoutMs)

  subscribe(() => {
    if (settled) return
    settled = true
    clearTimer(timer)
  })

  return timer
}
