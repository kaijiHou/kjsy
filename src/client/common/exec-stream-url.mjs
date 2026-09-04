/** Build the authenticated local exec-stream WebSocket URL. */
export function buildExecStreamUrl (port, pid, token, host) {
  const h = host || '127.0.0.1'
  return `ws://${h}:${port}/exec/${pid || '0'}?token=${encodeURIComponent(token || '')}`
}
