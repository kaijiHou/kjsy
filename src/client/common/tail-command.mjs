export function shellQuotePath (path) {
  return "'" + String(path).replace(/'/g, "'\\''") + "'"
}

export function buildTailCmd (path, initialLines = 200) {
  const lines = Number.isSafeInteger(initialLines) && initialLines >= 0 ? initialLines : 200
  const target = shellQuotePath(path)
  // Keep a shell owner in the foreground watching channel stdin. If the
  // renderer/app disappears without sending Stop, SSH closes stdin; the owner
  // then terminates and reaps tail instead of leaving a remote orphan.
  return [
    `tail -n ${lines} -F -- ${target} & easyssh_tail=$!`,
    "trap 'kill -TERM \"$easyssh_tail\" 2>/dev/null; wait \"$easyssh_tail\" 2>/dev/null' EXIT HUP INT TERM",
    'while IFS= read -r easyssh_keepalive; do :; done',
    'kill -TERM "$easyssh_tail" 2>/dev/null',
    'wait "$easyssh_tail" 2>/dev/null'
  ].join('; ')
}
