/**
 * EasySSH Log Monitor service（kjsy layer）
 *
 * 每个 log session 一个独立 exec-stream（复用现有 SSH transport——不建第二套连接、
 * 不污染 Terminal）。通过 session 的 ws 端口 /exec/:id 通道：
 *   start → {action:'exec-stream-start', streamId, cmd}
 *   data  → {type:'exec-stream-data', streamId, data(base64)}
 *   stop  → {action:'exec-stream-stop', streamId}（关闭远端 tail channel）
 *
 * 生命周期：startLog/stopLog/close（ws close → 主进程清理所有 stream）。
 * streamId = `log-${serverId}-${random}`——绑定 server/session，切服务器互不串。
 */

import { LineSplitter, Utf8Decoder, RingBuffer, isBinary } from './log-parser.mjs'
import { buildExecStreamUrl } from './exec-stream-url.mjs'
import { buildTailCmd } from './tail-command.mjs'

export { buildExecStreamUrl } from './exec-stream-url.mjs'
export { buildTailCmd } from './tail-command.mjs'

const MAX_LINES = 5000
const MAX_BYTES = 2 * 1024 * 1024
const BINARY_STOP_LINES = 50

export function buildWsUrl (port, pid) {
  // session-server 的 verify() 要求 ?token=<tokenElecterm>（与 terminal 同款认证）
  const host = window.location.hostname || '127.0.0.1'
  const token = (window.store && window.store.config && window.store.config.tokenElecterm) || ''
  return buildExecStreamUrl(port, pid, token, host)
}

/**
 * 启动一个 log stream
 * @param {object} opts { port, streamId, path, initialLines, onLines, onState, onError }
 * @returns {{ stop: Function, clear: Function, ws: WebSocket }}
 */
export function startLogStream (opts) {
  const {
    port,
    pid,
    streamId,
    path,
    initialLines = 200,
    onLines,
    onState,
    onError
  } = opts

  const splitter = new LineSplitter()
  const stderrSplitter = new LineSplitter()
  let stdoutDecoder = new Utf8Decoder()
  let stderrDecoder = new Utf8Decoder()
  const buffer = new RingBuffer(MAX_LINES, MAX_BYTES)
  let closed = false
  let userStop = false

  const ws = new WebSocket(buildWsUrl(port, pid))
  ws.onopen = () => {
    ws.send(JSON.stringify({
      action: 'exec-stream-start',
      streamId,
      cmd: buildTailCmd(path, initialLines)
    }))
    // Live 等 exec-stream-open ack（不提前显示）
    if (onState) onState('connecting')
  }
  ws.onmessage = (ev) => {
    let msg
    try {
      msg = JSON.parse(ev.data)
    } catch (e) {
      return
    }
    if (msg.streamId !== streamId) {
      return
    }
    if (msg.type === 'exec-stream-open') {
      if (onState) onState('live')
    } else if (msg.type === 'exec-stream-data') {
      const raw = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0))
      // binary 保护：NUL 比例高 → 立即停止（避免把二进制塞 UI）
      if (isBinary(raw)) {
        stop()
        if (onError) onError('This file does not appear to be a text log.')
        if (onState) onState('stopped')
        return
      }
      const text = stdoutDecoder.push(raw)
      if (!text) {
        return
      }
      const lines = splitter.push(text)
      lines.forEach(l => buffer.push(l))
      if (onLines) onLines(buffer.lines.slice())
    } else if (msg.type === 'exec-stream-stderr') {
      const raw = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0))
      const text = stderrDecoder.push(raw)
      if (!text) {
        return
      }
      const lines = stderrSplitter.push(text)
      lines.forEach(l => buffer.push(l))
      if (onLines) onLines(buffer.lines.slice())
    } else if (msg.type === 'exec-stream-close') {
      closed = true
      const rest = flushParsers()
      rest.forEach(l => buffer.push(l))
      if (onLines) onLines(buffer.lines.slice())
      if (onState) onState('stopped')
    } else if (msg.type === 'exec-stream-error') {
      if (onError) onError(msg.error || 'Log stream error')
      if (onState) onState('error')
    }
  }
  ws.onerror = () => {
    // 本地 WS 连不上 = session endpoint 失效（不是远程服务器问题）
    if (onError) onError('Log stream could not connect to the active SSH session.')
    if (onState) onState('error')
  }
  ws.onclose = () => {
    if (!closed) {
      const rest = flushParsers()
      rest.forEach(l => buffer.push(l))
      if (onLines) onLines(buffer.lines.slice())
      // 用户 Stop → Stopped；意外断开（session/WS 挂）→ Disconnected
      if (onState) onState(userStop ? 'stopped' : 'disconnected')
    }
  }

  function stop () {
    userStop = true
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'exec-stream-stop', streamId }))
      }
    } catch (e) {
      // best effort
    }
    try {
      ws.close()
    } catch (e) {
      // best effort
    }
  }

  function flushParsers () {
    const stdoutTail = stdoutDecoder.flush()
    const stderrTail = stderrDecoder.flush()
    return [
      ...(stdoutTail ? splitter.push(stdoutTail) : []),
      ...splitter.flush(),
      ...(stderrTail ? stderrSplitter.push(stderrTail) : []),
      ...stderrSplitter.flush()
    ]
  }

  function clear () {
    buffer.clear()
    splitter.clear()
    stderrSplitter.clear()
    stdoutDecoder = new Utf8Decoder()
    stderrDecoder = new Utf8Decoder()
    if (onLines) onLines([])
  }

  return { stop, clear, ws }
}

// eslint 标记（BINARY_STOP_LINES 保留给未来二进制恢复策略）
export const _binaryStopLines = BINARY_STOP_LINES
