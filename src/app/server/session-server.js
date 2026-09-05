const express = require('express')
const { Sftp } = require('./session-sftp')
const { instSftpKeys } = require('../common/constants')
const { Ftp } = require('./session-ftp')
const {
  sftp,
  transfer,
  onDestroySftp,
  onDestroyTransfer,
  terminals,
  cleanAllSessions
} = require('./remote-common')
const { Transfer, transferKeys } = require('./transfer')
const { Transfer: FtpTransfer } = require('./ftp-transfer')
const app = express()
const log = require('../common/log')
const appDec = require('./app-wrap')
const {
  createTerm,
  testTerm,
  resize,
  runCmd,
  execCmd,
  toggleTerminalLog,
  toggleTerminalLogTimestamp,
  setTerminalLogPath,
  startTerminalLogFile
} = require('./session-api')
const {
  isWin
} = require('../common/runtime-constants')
const wsDec = require('./ws-dec')
const { zmodemManager } = require('./zmodem')
const { trzszManager } = require('./trzsz')
const { xmodemManager } = require('./xmodem')

const {
  tokenElecterm,
  electermHost,
  wsPort,
  type
} = process.env

// Track whether any WebSocket has connected to detect orphaned processes
let firstWsConnected = false
function markConnected () {
  firstWsConnected = true
}

function verify (req) {
  const { token: to } = req.query
  if (to !== tokenElecterm) {
    throw new Error('not valid request')
  }
}

appDec(app)

if (type === 'rdp') {
  app.ws('/rdp/:pid', function (ws, req) {
    const { width, height } = req.query
    verify(req)
    markConnected()
    const term = terminals(req.params.pid)
    term.ws = ws
    log.debug('ws: connected to rdp session ->', term.pid, 'width=', width, 'height=', height)
    term.start(width, height)
    ws.on('error', (err) => {
      log.error('rdp ws error:', err)
    })
    ws.on('close', () => {
      log.debug('ws: rdp session ws closed ->', term.pid)
      cleanup()
    })
  })
} else if (type === 'vnc') {
  app.ws('/vnc/:pid', function (ws, req) {
    const { query } = req
    verify(req)
    markConnected()
    const { pid } = req.params
    const term = terminals(pid)
    term.ws = ws
    term.start(query)
    log.debug('ws: connected to vnc session ->', pid)
    ws.on('error', (err) => {
      log.error(err)
    })
    ws.on('close', () => {
      cleanup()
    })
  })
} else if (type === 'spice') {
  app.ws('/spice/:pid', function (ws, req) {
    const { query } = req
    verify(req)
    markConnected()
    const { pid } = req.params
    const term = terminals(pid)
    log.debug('ws: connected to spice session ->', pid)
    term.start(query, ws)
    ws.on('error', (err) => {
      log.error(err)
    })
  })
} else {
  app.ws('/terminals/:pid', function (ws, req) {
    verify(req)
    markConnected()
    const term = terminals(req.params.pid)
    const { pid } = term
    log.debug('ws: connected to terminal ->', pid)

    const dataBuffer = []
    let sendTimeout = null
    // Time of the last actual flush. Lets a chunk arriving after an idle gap
    // (keystroke echo, command result) skip the coalescing delay entirely,
    // so only chunks arriving inside an active burst (floods) pay the 10ms
    // wait. Mirrors the client-side coalescing fast path.
    let lastFlushTime = 0
    const flushIntervalMs = 10
    // EasySSH（Phase 4A-P0 §四十三）：有界服务端缓冲 + ws 积压监测。
    // 正常情况下 10ms 即 flush，dataBuffer 不会变大；此处上限只是极端场景
    // （renderer 卡死且流量洪峰）下的保险，丢弃最旧数据防止子进程无界增长。
    // ws.bufferedAmount 监控给出"卡死在哪一层"的诊断证据（§三十五矩阵）。
    const maxBufferBytes = 512 * 1024
    const wsBacklogWarnBytes = 4 * 1024 * 1024
    const backlogWarnIntervalMs = 5000
    let dataBufferBytes = 0
    let droppedBytes = 0
    let lastBacklogWarn = 0

    const flushBufferedData = () => {
      if (!dataBuffer.length) {
        sendTimeout = null
        return
      }
      lastFlushTime = Date.now()
      const combinedData = Buffer.concat(dataBuffer.splice(0).map(d => Buffer.isBuffer(d) ? d : Buffer.from(d)))
      dataBufferBytes -= combinedData.length
      if (droppedBytes > 0) {
        log.warn(`[EasySSH] terminal ${pid} server buffer overflow, dropped ${droppedBytes} bytes of oldest output`)
        droppedBytes = 0
      }
      if (ws.bufferedAmount > wsBacklogWarnBytes && Date.now() - lastBacklogWarn > backlogWarnIntervalMs) {
        lastBacklogWarn = Date.now()
        log.warn(`[EasySSH] terminal ${pid} ws backlog ${Math.round(ws.bufferedAmount / 1024 / 1024)}MB — renderer consuming slower than channel output`)
      }

      // Write to log (keep this)
      term.writeLog(combinedData)

      // Check for zmodem escape sequence before sending to client
      const zmodemConsumed = zmodemManager.handleData(pid, combinedData, term, ws)
      if (zmodemConsumed) {
        sendTimeout = null
        return
      }

      // Check for trzsz magic key before sending to client
      const trzszConsumed = trzszManager.handleData(pid, combinedData, term, ws)
      if (trzszConsumed) {
        sendTimeout = null
        return
      }

      // Detect XMODEM auto-trigger markers from serial device
      if (term.port) {
        detectXmodemMarker(combinedData.toString('utf8'))
      }

      // Check for xmodem protocol before sending to client
      const xmodemConsumed = xmodemManager.handleData(pid, combinedData, term, ws)
      if (xmodemConsumed) {
        sendTimeout = null
        return
      }

      // Not zmodem, trzsz, or xmodem data, send to WebSocket
      ws.send(combinedData)
      sendTimeout = null
    }

    // Create ws.s function for zmodem to send messages to client
    ws.s = (data) => {
      ws.send(JSON.stringify(data))
    }

    // Auto-trigger XMODEM when the serial device sends a marker message.
    // The serial-shell.js sends these markers when the user types tx/rx.
    function detectXmodemMarker (text) {
      const txMatch = text.match(/\[XMODEM:TX:(.+?)\]/)
      if (txMatch) {
        ws.s({
          action: 'xmodem-event',
          event: 'auto-trigger-receive',
          name: txMatch[1]
        })
        return
      }
      const rxMatch = text.match(/\[XMODEM:RX\]/)
      if (rxMatch) {
        ws.s({
          action: 'xmodem-event',
          event: 'auto-trigger-send'
        })
      }
    }

    // In the WebSocket setup, replace the data handler:
    term.on('data', function (data) {
      // Check if zmodem session is active and handle data
      if (zmodemManager.isActive(pid)) {
        // Let zmodem handle the data, but still log it
        term.writeLog(data)
        zmodemManager.handleData(pid, data, term, ws)
        return
      }

      // Check if trzsz session is active and handle data
      if (trzszManager.isActive(pid)) {
        // Let trzsz handle the data, but still log it
        term.writeLog(data)
        trzszManager.handleData(pid, data, term, ws)
        return
      }

      // Detect XMODEM auto-trigger markers from serial device
      if (term.port) {
        const text = Buffer.isBuffer(data) ? data.toString('utf8') : data
        detectXmodemMarker(text)
      }

      // Check if xmodem session is active and handle data.
      // For serial terminals (term.port exists) a raw port listener (registered below)
      // bypasses rxLineEnding transformation and feeds raw bytes to xmodem.
      if (xmodemManager.isActive(pid)) {
        if (!term.port) {
          // Non-serial fallback (should not normally happen)
          term.writeLog(data)
          xmodemManager.handleData(pid, data, term, ws)
        }
        return
      }

      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data)

      // Bypass batching for very large chunks to avoid parser desync.
      if (chunk.length > 16384) {
        if (sendTimeout) {
          clearTimeout(sendTimeout)
          sendTimeout = null
        }
        if (dataBuffer.length) {
          flushBufferedData()
        }
        term.writeLog(chunk)
        const zmodemConsumed = zmodemManager.handleData(pid, chunk, term, ws)
        if (zmodemConsumed) {
          return
        }
        const trzszConsumed = trzszManager.handleData(pid, chunk, term, ws)
        if (trzszConsumed) {
          return
        }
        const xmodemConsumed = xmodemManager.handleData(pid, chunk, term, ws)
        if (xmodemConsumed) {
          return
        }
        ws.send(chunk)
        return
      }

      // Buffer incoming data instead of sending immediately for normal text workload
      dataBuffer.push(chunk)
      dataBufferBytes += chunk.length
      // 有界保护：极端洪峰下丢最旧，防子进程内存无界增长（正常 10ms flush 永不触发）
      while (dataBufferBytes > maxBufferBytes && dataBuffer.length > 1) {
        const dropped = dataBuffer.shift()
        dataBufferBytes -= dropped.length
        droppedBytes += dropped.length
      }

      // Idle fast path: if nothing has been flushed within the coalescing
      // window, this is the start of a new burst (or a lone interactive
      // echo) rather than a continuation of a flood - send it right away
      // instead of paying the fixed delay. Only chunks arriving while a
      // burst is already in flight (elapsed < flushIntervalMs) get batched.
      const elapsed = Date.now() - lastFlushTime
      if (elapsed >= flushIntervalMs) {
        if (sendTimeout) {
          clearTimeout(sendTimeout)
          sendTimeout = null
        }
        flushBufferedData()
        return
      }

      // If no timeout is pending, schedule a batched send
      if (!sendTimeout) {
        sendTimeout = setTimeout(flushBufferedData, flushIntervalMs - elapsed)
      }
    })

    // For serial terminals, register a raw data listener directly on the port to
    // feed binary XMODEM data to xmodemManager without rxLineEnding transformation.
    if (term.port) {
      term.port.on('data', function (rawData) {
        if (xmodemManager.isActive(pid)) {
          term.writeLog(rawData)
          xmodemManager.handleData(pid, rawData, term, ws)
        }
      })
    }

    let onCloseCalled = false
    function onClose () {
      if (onCloseCalled) return
      onCloseCalled = true
      // Cancel any pending batched send
      if (sendTimeout) {
        clearTimeout(sendTimeout)
        sendTimeout = null
      }
      dataBuffer.length = 0
      // Clean up zmodem session
      zmodemManager.destroySession(pid)
      // Clean up trzsz session
      trzszManager.destroySession(pid)
      // Clean up xmodem session
      xmodemManager.destroySession(pid)
      term.kill()
      log.debug('Closed terminal ' + pid)
      // Clean things up
      ws.close && ws.close()
      cleanup()
    }

    term.on('close', onClose)
    if (term.isLocal && isWin) {
      term.on('exit', onClose)
    }

    ws.on('message', function (msg) {
      try {
        // Check if message is a zmodem or trzsz control message (JSON)
        if (typeof msg === 'string') {
          try {
            const parsed = JSON.parse(msg)
            if (parsed.action === 'zmodem-event') {
              zmodemManager.handleMessage(pid, parsed, term, ws)
              return
            }
            if (parsed.action === 'trzsz-event') {
              trzszManager.handleMessage(pid, parsed, term, ws)
              return
            }
            if (parsed.action === 'xmodem-event') {
              xmodemManager.handleMessage(pid, parsed, term, ws)
              return
            }
            if (parsed.action === 'keepalive') {
              // Write \n to the PTY.  In canonical mode the TTY line discipline
              // only delivers data to read() when a newline completes the line,
              // so \x00 (NUL) sits in the buffer and never wakes bash up.
              // A newline wakes bash's read(), resets the TMOUT alarm, and bash
              // simply re-displays the prompt.  The client suppresses that echo.
              term.write('\n\r\x1b[K')
              return
            }
          } catch (e) {
            // Not JSON, treat as regular terminal input
          }
        }
        term.write(msg)
      } catch (ex) {
        log.error(ex)
      }
    })

    ws.on('error', (err) => {
      log.error(err)
    })

    ws.on('close', onClose)
  })

  // sftp function
  app.ws('/sftp/:id', (ws, req) => {
    verify(req)
    wsDec(ws)
    const { id } = req.params
    ws.on('close', () => {
      onDestroySftp(id)
    })
    ws.on('message', async (message) => {
      let msg
      try {
        msg = JSON.parse(message)
        const { action } = msg

        if (action === 'sftp-new') {
          const { id, terminalId, type } = msg
          const Cls = type === 'ftp' ? Ftp : Sftp
          sftp(id, new Cls({
            uid: id,
            terminalId,
            type
          }))
        } else if (action === 'sftp-func') {
          const { id, args, func, uid } = msg
          const inst = sftp(id)
          if (!inst) {
            throw new Error('SFTP session is no longer available')
          }
          if (!instSftpKeys.includes(func) || typeof inst[func] !== 'function') {
            throw new Error('invalid sftp function: ' + func)
          }
          const data = await inst[func](...args)
          ws.s({
            id: uid,
            data
          })
        } else if (action === 'sftp-destroy') {
          const { id } = msg
          ws.close()
          onDestroySftp(id)
        }
      } catch (err) {
        // An SFTP operation error belongs to this request. Never let it reach
        // the process-level uncaughtException handler, which tears down the
        // otherwise healthy Terminal session.
        ws.s({
          id: msg && msg.uid,
          error: {
            message: err.message || String(err),
            stack: err.stack || ''
          }
        })
      }
    })
    // end
  })

  // exec stream（通用 streaming primitive——Log Monitor 等）
  // 协议：{action:'exec-stream-start', streamId, cmd} → data 推送
  //       {action:'exec-stream-stop', streamId} → 关闭 channel
  // ws close → TERM + close 该连接的所有 exec channel
  app.ws('/exec/:id', (ws, req) => {
    verify(req)
    wsDec(ws)
    const { id } = req.params
    // Registry ownership is per WebSocket. A Log tab closes its own socket;
    // it must never cancel streams belonging to other simultaneously open tabs.
    const execStreams = new Map()
    const sendExecMessage = (payload) => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(payload))
      }
    }

    ws.on('close', () => {
      execStreams.forEach((entry) => {
        entry.active = false
        try {
          if (entry.ctrl) entry.ctrl.cancel()
        } catch (e) {
          // best effort
        }
      })
      execStreams.clear()
    })

    ws.on('message', (message) => {
      let msg
      try {
        msg = JSON.parse(message)
      } catch (e) {
        return
      }
      const { action, streamId, cmd } = msg
      if (action === 'exec-stream-start') {
        const previous = execStreams.get(streamId)
        if (previous) {
          previous.active = false
          try {
            if (previous.ctrl) previous.ctrl.cancel()
          } catch (e) {
            // best effort
          }
          execStreams.delete(streamId)
        }
        const term = terminals(id)
        if (!term) {
          sendExecMessage({ type: 'exec-stream-error', streamId, error: 'No active session for this tab (disconnected or stale tabId)' })
          return
        }
        if (typeof term.execStream !== 'function') {
          sendExecMessage({ type: 'exec-stream-error', streamId, error: 'Exec stream not supported for this session type' })
          return
        }
        const entry = { ctrl: null, active: true }
        execStreams.set(streamId, entry)
        const ctrl = term.execStream(cmd, {
          onStart: () => {
            // exec channel 已建立——renderer 据此才显示 Live
            sendExecMessage({ type: 'exec-stream-open', streamId })
          },
          onData: (data) => {
            sendExecMessage({ type: 'exec-stream-data', streamId, data: data.toString('base64') })
          },
          onStderr: (data) => {
            sendExecMessage({ type: 'exec-stream-stderr', streamId, data: data.toString('base64') })
          },
          onClose: () => {
            if (execStreams.get(streamId) === entry) {
              execStreams.delete(streamId)
            }
            entry.active = false
            sendExecMessage({ type: 'exec-stream-close', streamId })
          },
          onError: (err) => {
            if (execStreams.get(streamId) === entry) {
              execStreams.delete(streamId)
            }
            entry.active = false
            sendExecMessage({ type: 'exec-stream-error', streamId, error: (err && err.message) || String(err) })
          }
        })
        if (ctrl) {
          entry.ctrl = ctrl
          if (!entry.active) {
            ctrl.cancel()
          }
        } else if (execStreams.get(streamId) === entry) {
          execStreams.delete(streamId)
        }
      } else if (action === 'exec-stream-stop') {
        const entry = execStreams.get(streamId)
        if (entry) {
          entry.active = false
          try {
            if (entry.ctrl) entry.ctrl.cancel()
          } catch (e) {
            // best effort
          }
          execStreams.delete(streamId)
        }
      }
    })
  })

  // transfer function
  app.ws('/transfer/:id', (ws, req) => {
    verify(req)
    wsDec(ws)
    const { id } = req.params
    const { sftpId } = req.query

    ws.on('close', () => {
      onDestroyTransfer(id, sftpId)
    })
    ws.on('message', (message) => {
      const msg = JSON.parse(message)
      const { action } = msg

      if (action === 'transfer-new') {
        const { sftpId, id, isFtp } = msg
        const session = sftp(sftpId)
        const encode = session.initOptions?.encode || 'utf8'
        const opts = Object.assign({}, msg, {
          sftp: session.sftp,
          conn: session.client,
          ftpSession: isFtp ? session : null,
          sftpId,
          ws,
          encode
        })
        const Cls = isFtp ? FtpTransfer : Transfer
        transfer(id, sftpId, new Cls(opts))
      } else if (action === 'transfer-func') {
        const { id, func, args, sftpId } = msg
        if (func === 'destroy') {
          return onDestroyTransfer(id, sftpId)
        }
        if (!transferKeys.includes(func)) {
          return
        }
        const tr = transfer(id, sftpId)
        if (!tr || typeof tr[func] !== 'function') {
          return
        }
        tr[func](...args)
      }
    })
    // end
  })
}

// Add a process message handler instead
process.on('message', async (message) => {
  if (message.type === 'common') {
    const msg = message.data
    const { action, id, body } = msg

    let promise

    const ws = {
      s: (data) => {
        process.send({
          type: 'common',
          data
        })
      },
      once: (callack, id) => {
        const func = (arg) => {
          if (id === arg.id) {
            callack(arg)
            process.removeListener('message', func)
          }
        }
        process.on('message', func)
      }
    }

    if (action === 'create-terminal') {
      promise = createTerm(body, ws)
    } else if (action === 'test-terminal') {
      promise = testTerm(body, ws)
    } else if (action === 'resize-terminal') {
      promise = resize(body)
    } else if (action === 'toggle-terminal-log') {
      promise = toggleTerminalLog(body)
    } else if (action === 'toggle-terminal-log-timestamp') {
      promise = toggleTerminalLogTimestamp(body)
    } else if (action === 'set-terminal-log-path') {
      promise = setTerminalLogPath(body)
    } else if (action === 'start-terminal-log-file') {
      promise = startTerminalLogFile(body)
    } else if (action === 'run-cmd') {
      promise = runCmd(body)
    } else if (action === 'exec-cmd') {
      promise = execCmd(body)
    }

    const result = await promise
      .then(r => {
        return {
          id,
          data: r
        }
      })
      .catch(err => {
        log.error('common message error', err)
        return {
          id,
          error: {
            message: err.message,
            stack: err.stack
          }
        }
      })

    // Send the result back to the parent process
    process.send(result)
  }
})

const runServer = function () {
  return new Promise((resolve) => {
    app.listen(wsPort, electermHost, () => {
      log.info('session server', 'runs on', electermHost, wsPort)
      resolve()
    })
  })
}

async function main () {
  await runServer()
  process.send({ serverInited: true })
}

main()

let cleanupCalled = false
function cleanup () {
  if (cleanupCalled) return
  cleanupCalled = true
  cleanAllSessions()
  setTimeout(() => {
    process.exit(0)
  }, 2000)
}

// Self-terminate if the parent process IPC channel disconnects (e.g. Electron crashes/restarts)
// Without this, child processes become orphans and accumulate in memory
process.on('disconnect', () => {
  log.warn('session-server: parent IPC disconnected, terminating')
  cleanup()
})

// Self-terminate if no WebSocket connects within 2 minutes of server start
// This handles the case where the frontend unmounts before the WebSocket is established
const noConnectionTimer = setTimeout(() => {
  if (!firstWsConnected) {
    log.warn('session-server: no WS connection within 2min timeout, terminating')
    cleanup()
  }
}, 120000)
if (noConnectionTimer.unref) noConnectionTimer.unref()

process.on('uncaughtException', (err) => {
  log.error('uncaughtException', err)
  cleanup()
})
process.on('unhandledRejection', (err) => {
  log.error('unhandledRejection', err)
  cleanup()
})

process.on('SIGTERM', cleanup)
