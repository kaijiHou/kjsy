/**
 * EasySSH Log Monitor view（Phase 3C）
 *
 * - mount → 启动 tail stream；unmount → stop（关闭远端 tail channel）
 * - Follow Output 默认 ON（新行自动滚底）；用户向上滚 → Follow OFF
 * - Pause：仅暂停自动滚动（stream 继续，数据进 ring buffer）
 * - Clear：只清本地显示 buffer（绝不触碰远程文件）
 * - Stop：关闭 tail channel（保留静态内容，状态 Stopped）
 * - 每 log 一个独立 stream（复用 SSH transport——不污染 Terminal）
 */

import { useEffect, useRef, useState } from 'react'
import { PauseOutlined, CaretRightOutlined, ClearOutlined, StopOutlined, DownOutlined } from '@ant-design/icons'
import { startLogStream } from '../../common/kjsy-log-service'

export default function LogMonitorView ({ log, serverId, port, pid }) {
  const [lines, setLines] = useState([])
  const [status, setStatus] = useState('connecting')
  const [error, setError] = useState(null)
  const [follow, setFollow] = useState(true)
  const [paused, setPaused] = useState(false)
  const streamRef = useRef(null)
  const bodyRef = useRef(null)
  const followRef = useRef(true)

  useEffect(() => {
    followRef.current = follow
  }, [follow])
  // 启动/停止 stream（mount/unmount；log/serverId/port/pid 变化时重启——
  // pid 必须入依赖：连接重建后 tab.id 变化，旧闭包会连到死 session）
  useEffect(() => {
    if (!port || !pid || !log) {
      setStatus('disconnected')
      return
    }
    setLines([])
    setError(null)
    setStatus('connecting')
    const stream = startLogStream({
      port,
      pid,
      streamId: log.id,
      path: log.path,
      initialLines: 200,
      onLines: (l) => {
        // Pause 只停自动跟随——数据照常进入视图（不丢弃）
        setLines(l)
      },
      onState: (s) => {
        setStatus(s)
        if (s !== 'live') {
          setPaused(false)
        }
      },
      onError: (e) => {
        setError(e)
        setStatus('error')
      }
    })
    streamRef.current = stream
    return () => {
      stream.stop()
      streamRef.current = null
    }
  }, [log, port, serverId, pid])

  // Follow：新行后自动滚底（仅当 follow 开启）
  useEffect(() => {
    if (follow && !paused && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [lines, follow, paused])

  const onScroll = () => {
    const el = bodyRef.current
    if (!el) {
      return
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (nearBottom) {
      if (!followRef.current) {
        followRef.current = true
        setFollow(true)
      }
    } else if (followRef.current) {
      followRef.current = false
      setFollow(false)
    }
  }

  if (!log) {
    return null
  }

  const live = status === 'live'
  // Pause = 停止自动跟随（数据仍显示）——状态文本同步
  const statusText = paused
    ? 'Paused'
    : live
      ? '● Live'
      : status === 'stopped'
        ? 'Stopped'
        : status === 'connecting'
          ? 'Connecting…'
          : status === 'error'
            ? 'Error'
            : status === 'disconnected'
              ? 'Disconnected'
              : 'Opening'

  return (
    <div className='easyssh-log-monitor'>
      <div className='easyssh-log-head'>
        <span className='easyssh-log-title' title={log.path}>
          {log.name}
          <span className={'easyssh-log-live ' + (live && !paused ? 'on' : '')}>
            {statusText}
          </span>
        </span>
        <span className='easyssh-log-actions'>
          <span
            className={'easyssh-log-action' + (follow ? ' active' : '')}
            onClick={() => {
              setPaused(false)
              setFollow(true)
              if (bodyRef.current) {
                bodyRef.current.scrollTop = bodyRef.current.scrollHeight
              }
            }}
            title='Follow output'
          >
            <DownOutlined /> Follow
          </span>
          <span
            className='easyssh-log-action'
            onClick={() => {
              if (live) {
                setPaused(p => !p)
              }
            }}
            title={paused ? 'Resume follow' : 'Pause follow (data keeps arriving)'}
          >
            {paused ? <CaretRightOutlined /> : <PauseOutlined />} {paused ? 'Resume' : 'Pause Follow'}
          </span>
          <span
            className='easyssh-log-action'
            onClick={() => {
              if (streamRef.current) {
                streamRef.current.clear()
              } else {
                setLines([])
              }
            }}
            title='Clear view (local only)'
          >
            <ClearOutlined /> Clear
          </span>
          <span
            className='easyssh-log-action'
            onClick={() => {
              if (streamRef.current) {
                streamRef.current.stop()
              }
            }}
            title='Stop (closes remote tail)'
          >
            <StopOutlined /> Stop
          </span>
        </span>
      </div>
      {error && <div className='easyssh-log-error'>{error}</div>}
      <div className='easyssh-log-body' ref={bodyRef} onScroll={onScroll}>
        {lines.length === 0 && status === 'live'
          ? <div className='easyssh-log-empty'>Waiting for log output…</div>
          : null}
        {lines.map((l, i) => (
          <div className='easyssh-log-line' key={i}>{l || '\u00a0'}</div>
        ))}
        {lines.length === 0 && status === 'stopped' && <div className='easyssh-log-empty'>Log stream stopped.</div>}
        {lines.length === 0 && status === 'disconnected' && <div className='easyssh-log-empty'>Disconnected.</div>}
      </div>
    </div>
  )
}
