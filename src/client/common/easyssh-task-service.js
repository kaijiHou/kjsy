import {
  buildListTasksCommand,
  buildStartTaskCommand,
  buildStopTaskCommand,
  parseTaskRows
} from './task-parser.mjs'

const EXEC_TIMEOUT_MS = 10000

async function exec (wsFetch, tabId, cmd, timeoutMs = EXEC_TIMEOUT_MS) {
  if (!wsFetch || !tabId) throw new Error('Server is not connected.')
  const result = await wsFetch({ action: 'exec-cmd', pid: tabId, cmd, timeoutMs })
  if (result && result.timedOut) throw new Error('Task request timed out.')
  if (result && result.exitCode !== 0) {
    throw new Error((result.stderr || '').trim() || 'Task request failed.')
  }
  return result || { stdout: '', stderr: '', exitCode: null }
}

export async function listRemoteTasks (wsFetch, tabId) {
  const result = await exec(wsFetch, tabId, buildListTasksCommand())
  return parseTaskRows(result.stdout).slice(0, 20)
}

export async function startRemoteTask (wsFetch, tabId, options) {
  const result = await exec(wsFetch, tabId, buildStartTaskCommand(options))
  const pid = Number(String(result.stdout || '').trim().split(/\s+/).pop())
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error('Task did not return a valid PID.')
  return pid
}

export async function stopRemoteTask (wsFetch, tabId, task, signal = 'TERM') {
  const result = await exec(wsFetch, tabId, buildStopTaskCommand(task.id, task.pid, signal))
  return String(result.stdout || '').trim().split(/\s+/).pop() === 'RUNNING'
}
