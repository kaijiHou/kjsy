const TASK_ID_RE = /^task-[a-z0-9-]+$/

export function shellQuote (value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'"
}

export function validateTaskId (taskId) {
  if (!TASK_ID_RE.test(String(taskId))) {
    throw new Error('Invalid task id')
  }
  return String(taskId)
}

export function cwdExpression (cwd) {
  const value = String(cwd || '~').trim() || '~'
  if (value === '~') {
    return '"$HOME"'
  }
  if (value.startsWith('~/')) {
    return '"$HOME"/' + shellQuote(value.slice(2))
  }
  return shellQuote(value)
}

function decodeBase64 (value) {
  if (!value) return ''
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf8')
  }
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function parseTaskRows (text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const fields = line.split('\t')
      if (fields.length !== 9 || !TASK_ID_RE.test(fields[0]) || !/^\d+$/.test(fields[1])) {
        return null
      }
      return {
        id: fields[0],
        pid: Number(fields[1]),
        startedAt: Number(fields[2]) * 1000,
        endedAt: /^\d+$/.test(fields[3]) ? Number(fields[3]) * 1000 : null,
        exitCode: /^-?\d+$/.test(fields[4]) ? Number(fields[4]) : null,
        status: fields[5] === '1' ? 'running' : (/^-?\d+$/.test(fields[4]) ? 'exited' : 'unknown'),
        logPath: decodeBase64(fields[6]),
        cwd: decodeBase64(fields[7]),
        command: decodeBase64(fields[8])
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.startedAt - a.startedAt)
}

export function buildStartTaskCommand ({ taskId, command, cwd, startedAt }) {
  const id = validateTaskId(taskId)
  const cmd = String(command || '').trim()
  if (!cmd) throw new Error('Command is required')
  const started = Math.floor(Number(startedAt || Date.now()) / 1000)
  const codeDefault = '$' + '{code:-}'
  const wrapper = 'cd -- "$1" || code=125; if [ -z "' + codeDefault + '" ]; then sh -c "$2" "$0"; code=$?; fi; printf \'%s\\n\' "$code" > "$3"; date +%s > "$4"; exit "$code"'
  return [
    'root="$HOME/.easyssh/tasks"',
    'mkdir -p "$root" || exit 1',
    `base="$root/${id}"`,
    ': > "$base.log" || exit 1',
    `printf '%s' ${shellQuote(cmd)} > "$base.command"`,
    `printf '%s' ${shellQuote(String(cwd || '~'))} > "$base.cwd"`,
    `printf '%s\n' '${started}' > "$base.started"`,
    'rm -f "$base.exit"',
    `setsid sh -c ${shellQuote(wrapper)} ${id} ${cwdExpression(cwd)} ${shellQuote(cmd)} "$base.exit" "$base.ended" >> "$base.log" 2>&1 < /dev/null & pid=$!`,
    'printf \'%s\\n\' "$pid" > "$base.pid"',
    'printf \'%s\\n\' "$pid"'
  ].join('; ')
}

export function buildListTasksCommand () {
  const stripPidSuffix = '$' + '{pidfile%.pid}'
  const taskBasename = '$' + '{base##*/}'
  return [
    'root="$HOME/.easyssh/tasks"',
    '[ -d "$root" ] || exit 0',
    'for pidfile in "$root"/task-*.pid; do',
    '  [ -f "$pidfile" ] || continue',
    '  base=' + stripPidSuffix + '; id=' + taskBasename + '; pid=$(cat "$pidfile" 2>/dev/null)',
    '  case "$pid" in ""|*[!0-9]*) continue ;; esac',
    '  started=$(cat "$base.started" 2>/dev/null || printf 0)',
    '  ended=$(cat "$base.ended" 2>/dev/null || true)',
    '  alive=0; for proc in $(ps -eo pid= -o pgid= | awk -v pgid="$pid" \'$2 == pgid { print $1 }\'); do if tr \'\\000\' \'\\n\' < "/proc/$proc/cmdline" 2>/dev/null | grep -Fxq -- "$id"; then alive=1; break; fi; done',
    '  if [ "$alive" = 1 ]; then code=""; ended=""; else code=$(cat "$base.exit" 2>/dev/null || true); fi',
    '  log64=$(printf \'%s\' "$base.log" | base64 | tr -d \'\\r\\n\')',
    '  cwd64=$(base64 < "$base.cwd" 2>/dev/null | tr -d \'\\r\\n\')',
    '  cmd64=$(base64 < "$base.command" 2>/dev/null | tr -d \'\\r\\n\')',
    '  printf \'%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n\' "$id" "$pid" "$started" "$ended" "$code" "$alive" "$log64" "$cwd64" "$cmd64"',
    'done'
  ].join('\n')
}

export function buildStopTaskCommand (taskId, pid, signal = 'TERM') {
  const id = validateTaskId(taskId)
  const value = Number(pid)
  if (!Number.isSafeInteger(value) || value <= 1) throw new Error('Invalid task pid')
  if (signal !== 'TERM' && signal !== 'KILL') throw new Error('Invalid signal')
  const code = signal === 'KILL' ? 137 : 143
  const groupIdentity = `found=0; for proc in $(ps -eo pid= -o pgid= | awk -v pgid='${value}' '$2 == pgid { print $1 }'); do if tr '\\000' '\\n' < "/proc/$proc/cmdline" 2>/dev/null | grep -Fxq -- '${id}'; then found=1; break; fi; done; [ "$found" = 1 ]`
  return [
    `base="$HOME/.easyssh/tasks/${id}"`,
    `${groupIdentity} || { printf '%s\\n' 'Task process identity no longer matches.' >&2; exit 2; }`,
    `kill -${signal} -- -${value} 2>/dev/null || kill -${signal} ${value} 2>/dev/null || true`,
    `i=0; while kill -0 -- -${value} 2>/dev/null && [ "$i" -lt 20 ]; do sleep 0.1; i=$((i + 1)); done`,
    `if ${groupIdentity}; then printf '%s\\n' RUNNING; else [ -s "$base.exit" ] || printf '%s\n' '${code}' > "$base.exit"; [ -s "$base.ended" ] || date +%s > "$base.ended"; printf '%s\\n' STOPPED; fi`
  ].join('; ')
}
