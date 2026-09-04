import { useCallback, useEffect, useRef, useState } from 'react'
import { CloseOutlined, ReloadOutlined, PlayCircleOutlined } from '@ant-design/icons'
import {
  listRemoteTasks,
  startRemoteTask,
  stopRemoteTask
} from '../../common/easyssh-task-service'

const MAX_RUNNING = 5
const POLL_MS = 3000

function elapsed (startedAt, endedAt, now, running) {
  if (!startedAt) return '—'
  const seconds = Math.max(0, Math.floor(((running ? now : (endedAt || now)) - startedAt) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h ? `${h}h ${m}m` : (m ? `${m}m ${s}s` : `${s}s`)
}

export default function TaskPanel ({ open, onClose, tabId, serverId, defaultCwd, wsFetch, onOpenLog }) {
  const [tasks, setTasks] = useState([])
  const [command, setCommand] = useState('')
  const [cwd, setCwd] = useState(defaultCwd || '~')
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(Date.now())
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!open || !tabId || inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      setTasks(await listRemoteTasks(wsFetch, tabId))
      setError(null)
    } catch (e) {
      setError(e.message || 'Unable to query tasks.')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [open, tabId, wsFetch])

  useEffect(() => {
    if (!open) return
    setCwd(defaultCwd || '~')
    setTasks([])
    setError(null)
    refresh()
    const poll = window.setInterval(refresh, POLL_MS)
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(clock)
      inFlight.current = false
    }
  }, [open, tabId])

  const start = async () => {
    const value = command.trim()
    if (!value || starting) return
    if (tasks.filter(t => t.status === 'running').length >= MAX_RUNNING) {
      setError(`At most ${MAX_RUNNING} tasks may run at once.`)
      return
    }
    setStarting(true)
    setError(null)
    try {
      const taskId = 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
      await startRemoteTask(wsFetch, tabId, {
        taskId,
        command: value,
        cwd: cwd.trim() || '~',
        startedAt: Date.now()
      })
      setCommand('')
      await refresh()
      window.setTimeout(refresh, 300)
    } catch (e) {
      setError(e.message || 'Unable to start task.')
    } finally {
      setStarting(false)
    }
  }

  const stop = async (task) => {
    setError(null)
    try {
      const stillRunning = await stopRemoteTask(wsFetch, tabId, task, 'TERM')
      if (stillRunning && window.confirm('The task is still running. Force stop it?')) {
        await stopRemoteTask(wsFetch, tabId, task, 'KILL')
      }
      await refresh()
      window.setTimeout(refresh, 300)
    } catch (e) {
      setError(e.message || 'Unable to stop task.')
    }
  }

  if (!open) return null
  const connected = Boolean(tabId)

  return (
    <div className='easyssh-task-panel'>
      <div className='easyssh-task-head'>
        <span className='easyssh-task-title'>Remote Tasks</span>
        <span className='easyssh-task-actions'>
          <span className={'easyssh-task-icon' + (loading ? ' spinning' : '')} onClick={refresh} title='Refresh'><ReloadOutlined /></span>
          <span className='easyssh-task-icon' onClick={onClose} title='Close'><CloseOutlined /></span>
        </span>
      </div>
      <div className='easyssh-task-form'>
        <label>Working directory</label>
        <input value={cwd} onChange={e => setCwd(e.target.value)} disabled={!connected || starting} />
        <label>Command</label>
        <textarea
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') start()
          }}
          placeholder='e.g. ./train.sh'
          disabled={!connected || starting}
        />
        <button onClick={start} disabled={!connected || !command.trim() || starting}>
          <PlayCircleOutlined /> {starting ? 'Starting…' : 'Run Task'}
        </button>
        <span className='easyssh-task-shortcut'>Ctrl+Enter</span>
      </div>
      {error && <div className='easyssh-task-error'>{error}</div>}
      <div className='easyssh-task-list'>
        {!tasks.length && !loading && <div className='easyssh-task-empty'>No recorded tasks on this server.</div>}
        {tasks.map(task => (
          <div className='easyssh-task-card' key={task.id}>
            <div className='easyssh-task-card-top'>
              <span className={'easyssh-task-dot ' + task.status} />
              <span className='easyssh-task-command' title={task.command}>{task.command || task.id}</span>
              <span className={'easyssh-task-status ' + task.status}>
                {task.status === 'running' ? 'Running' : (task.exitCode == null ? 'Unknown' : `Exited ${task.exitCode}`)}
              </span>
            </div>
            <div className='easyssh-task-meta'>PID {task.pid} · {elapsed(task.startedAt, task.endedAt, now, task.status === 'running')} · {task.cwd}</div>
            <div className='easyssh-task-card-actions'>
              <button onClick={() => onOpenLog(serverId, task.logPath)}>Open Log</button>
              {task.status === 'running' && <button className='danger' onClick={() => stop(task)}>Stop</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
