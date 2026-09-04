/**
 * EasySSH GPU Status Panel（Phase 3A MVP + Phase 3B live monitor）
 *
 * - 打开时立即查询 + Auto Refresh（Off/5s/10s/30s，默认 5s）
 * - 查询完成才安排下次（天然最多 1 个 in-flight；手动 Refresh 同样 guard）
 * - 关闭/断开/切服务器 → 停止 polling 并清旧 state
 * - 刷新不闪空（保留旧数据 + 小 spinner）
 * - Idle/In use 判定来自 service（明确规则）；Processes 显示 user（批量 ps）
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ReloadOutlined, CloseOutlined } from '@ant-design/icons'
import { queryGpuStatus, processBasename } from '../../common/easyssh-gpu'

const REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 }
]
const DEFAULT_INTERVAL = 5000

function Metric ({ label, value, pct }) {
  return (
    <div className='easyssh-gpu-metric'>
      <div className='easyssh-gpu-metric-row'>
        <span className='easyssh-gpu-metric-label'>{label}</span>
        <span className='easyssh-gpu-metric-value'>{value}</span>
      </div>
      {pct != null && (
        <div className='easyssh-gpu-bar'>
          <div className='easyssh-gpu-bar-fill' style={{ width: Math.min(100, Math.max(0, pct)) + '%' }} />
        </div>
      )}
    </div>
  )
}

function fmtMem (miB) {
  if (miB == null) return '—'
  return Math.round(miB) + ' MiB'
}

function fmtTime (d) {
  const p = (n) => String(n).padStart(2, '0')
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
}

export default function GpuPanel ({ open, onClose, tabId, wsFetch }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [interval, setIntervalMs] = useState(DEFAULT_INTERVAL)
  const [updatedAt, setUpdatedAt] = useState(null)
  const inFlightRef = useRef(false)
  const timerRef = useRef(null)
  const dataRef = useRef(null)

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const refresh = useCallback(async (opts = {}) => {
    const { silent } = opts
    if (inFlightRef.current) {
      return
    }
    if (!tabId) {
      setError('Server is not connected.')
      stopTimer()
      return
    }
    inFlightRef.current = true
    if (!silent) {
      setLoading(true)
    }
    // 失败时保留旧数据（错误只显示小提示条，不清卡片）
    const res = await queryGpuStatus(wsFetch, tabId)
    inFlightRef.current = false
    setLoading(false)
    if (res.error) {
      // 断开/不可用：保留旧数据但显示错误 + 停止轮询（避免每 5s 报错）
      setError(res.error)
      if (/not connected|timed out/i.test(res.error)) {
        stopTimer()
      }
      return
    }
    setError(null)
    dataRef.current = res
    setData(res)
    setUpdatedAt(new Date())
  }, [tabId, wsFetch, stopTimer])

  // 打开时立即查询；interval 变化时重启轮询
  useEffect(() => {
    if (!open) {
      return
    }
    refresh({ silent: dataRef.current != null })
    if (interval > 0) {
      stopTimer()
      timerRef.current = setTimeout(function tick () {
        refresh({ silent: true })
        timerRef.current = setTimeout(tick, interval)
      }, interval)
    }
    return () => {
      stopTimer()
    }
    // refresh 由 tabId/wsFetch 驱动；interval 变化重启
  }, [open, interval])

  // 切服务器（tabId 变化）→ 清旧数据
  useEffect(() => {
    dataRef.current = null
    setData(null)
    setUpdatedAt(null)
    setError(null)
    inFlightRef.current = false
  }, [tabId])

  if (!open) {
    return null
  }

  const idleCount = data ? data.gpus.filter(g => g.status === 'idle').length : 0
  const inUseCount = data ? data.gpus.length - idleCount : 0

  return (
    <div className='easyssh-gpu-panel'>
      <div className='easyssh-gpu-head'>
        <span className='easyssh-gpu-title'>GPU Status</span>
        <span className='easyssh-gpu-actions'>
          <select
            className='easyssh-gpu-interval'
            value={interval}
            onChange={e => setIntervalMs(Number(e.target.value))}
            title='Auto refresh interval'
          >
            {REFRESH_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span
            className={'easyssh-gpu-action' + (loading ? ' spinning' : '')}
            onClick={() => refresh({ silent: true })}
            title='Refresh'
          >
            <ReloadOutlined />
          </span>
          <span className='easyssh-gpu-action' onClick={onClose} title='Close'>
            <CloseOutlined />
          </span>
        </span>
      </div>
      {data && (
        <div className='easyssh-gpu-summary'>
          {data.gpus.length} GPUs · {idleCount} Idle · {inUseCount} In use
          {updatedAt && <span className='easyssh-gpu-updated'>Updated {fmtTime(updatedAt)}</span>}
        </div>
      )}
      {!data && loading && <div className='easyssh-gpu-loading'>Loading…</div>}
      {!data && !loading && error && <div className='easyssh-gpu-error'>{error}</div>}
      {data && error && <div className='easyssh-gpu-error easyssh-gpu-error-inline'>{error}</div>}
      {data && (
        <>
          {data.gpus.map(g => (
            <div className={'easyssh-gpu-card' + (g.status === 'idle' ? ' idle' : '')} key={g.index}>
              <div className='easyssh-gpu-card-title' title={g.name}>
                <span className={'easyssh-gpu-dot ' + g.status} />
                GPU {g.index} · {g.name}
                <span className={'easyssh-gpu-status ' + g.status}>
                  {g.status === 'idle' ? 'Idle' : 'In use'}
                </span>
              </div>
              <div className='easyssh-gpu-metrics'>
                <Metric
                  label='Utilization'
                  value={g.utilization == null ? '—' : g.utilization + '%'}
                  pct={g.utilization}
                />
                <Metric
                  label='Memory'
                  value={fmtMem(g.memoryUsed) + ' / ' + fmtMem(g.memoryTotal)}
                  pct={g.memoryTotal ? (g.memoryUsed / g.memoryTotal) * 100 : null}
                />
                <div className='easyssh-gpu-metric'>
                  <div className='easyssh-gpu-metric-row'>
                    <span className='easyssh-gpu-metric-label'>Temperature</span>
                    <span className='easyssh-gpu-metric-value'>{g.temperature == null ? '—' : g.temperature + '°C'}</span>
                  </div>
                </div>
                <div className='easyssh-gpu-metric'>
                  <div className='easyssh-gpu-metric-row'>
                    <span className='easyssh-gpu-metric-label'>Power</span>
                    <span className='easyssh-gpu-metric-value'>
                      {g.powerDraw == null ? '—' : Math.round(g.powerDraw) + ' W'}
                      {g.powerLimit != null ? ' / ' + Math.round(g.powerLimit) + ' W' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className='easyssh-gpu-procs'>
            <div className='easyssh-gpu-procs-title'>Processes</div>
            {data.processes.length === 0
              ? <div className='easyssh-gpu-procs-empty'>No running GPU processes</div>
              : data.processes
                .slice()
                .sort((a, b) => {
                  const g = String(a.gpuIndex ?? 'z').localeCompare(String(b.gpuIndex ?? 'z'))
                  if (g !== 0) return g
                  return (b.memoryUsed ?? 0) - (a.memoryUsed ?? 0)
                })
                .map((p, i) => (
                  <div className='easyssh-gpu-proc' key={i}>
                    <span className='easyssh-gpu-proc-gpu'>GPU {p.gpuIndex ?? '?'}</span>
                    <span className='easyssh-gpu-proc-user' title={p.user || 'unknown'}>{p.user || '—'}</span>
                    <span className='easyssh-gpu-proc-pid'>{p.pid}</span>
                    <span className='easyssh-gpu-proc-name' title={p.processName}>{processBasename(p.processName)}</span>
                    <span className='easyssh-gpu-proc-mem'>{fmtMem(p.memoryUsed)}</span>
                  </div>
                ))}
          </div>
        </>
      )}
    </div>
  )
}
