import { auto } from 'manate/react'
import { useEffect, useRef, useState } from 'react'
import {
  CloseOutlined,
  SaveOutlined
} from '@ant-design/icons'
import { ensureSftp, getTerminalPort } from '../../common/easyssh-sftp'
import CodeMirrorEditor from './codemirror-editor'
import LogMonitorView from './log-monitor'
import './easyssh.styl'

/**
 * Remote Editor —— 远程文件编辑
 * 读写完全复用 electerm SFTP（ensureSftp），Ctrl+S 写回服务器
 */
export default auto(function EditorPanel (props) {
  const { store, bm, tab, height } = props
  // Log Monitor 需要 terminal 的 ws 端口（exec-stream 通道）
  const termPort = tab ? getTerminalPort(tab.id) : null
  const editors = store.editors
  const active = editors.find(e => e.id === store.easysshActiveEditorId) || null
  const sftpRef = useRef(null)
  const [retryCount, setRetryCount] = useState(0)

  // 与 Explorer 共享 SFTP 连接
  useEffect(() => {
    if (!bm) {
      return
    }
    ensureSftp(store, { ...tab, ...bm, id: tab.id }).then(s => {
      sftpRef.current = s
    })
  }, [bm?.id])

  // 新文件打开 → 读取远程内容（含耗时 profiling 与超时保护）
  useEffect(() => {
    const ed = editors.find(e => e.id === store.easysshActiveEditorId)
    if (!ed || !ed.loading || ed.text || ed.error) {
      return
    }
    const t0 = Date.now()
    const t1 = t0
    console.log(`[EasySSH FileOpen] click -> read start (${Date.now() - t0}ms) path=${ed.path}`)
    ensureSftp(store, { ...tab, ...bm, id: tab.id }).then(async sftp => {
      const t4 = Date.now()
      console.log(`[EasySSH FileOpen] SFTP ready (${t4 - t0}ms)`)
      if (!sftp) {
        store.easysshSetEditorError(ed.id, 'SFTP not ready (connection lost)')
        return
      }
      try {
        const t5 = Date.now()
        const text = await sftp.readFile(ed.path)
        const t6 = Date.now()
        console.log(`[EasySSH FileOpen] readFile ${ed.path} (${t6 - t5}ms, len=${(text || '').length})`)
        store.easysshSetEditorText(ed.id, text)
        console.log(`[EasySSH FileOpen] total ${Date.now() - t0}ms (ensureSftp ${t4 - t1}ms, read ${t6 - t5}ms)`)
      } catch (e) {
        console.log(`[EasySSH FileOpen] FAIL ${Date.now() - t0}ms: ${e.message}`)
        store.easysshSetEditorError(ed.id, (e.message || 'read failed') + ' (click Retry to try again)')
      }
    })
    // 超时保护：15s 未完成 → 错误态（不无限 Loading）
    const timer = setTimeout(() => {
      const cur = store.editors.find(x => x.id === ed.id)
      if (cur && cur.loading) {
        console.log(`[EasySSH FileOpen] TIMEOUT after 15s: ${ed.path}`)
        store.easysshSetEditorError(ed.id, 'Timeout reading remote file (15s)')
      }
    }, 15000)
    return () => clearTimeout(timer)
  }, [store.easysshActiveEditorId, editors.length, retryCount])

  const retry = () => {
    if (!active) {
      return
    }
    store.easysshSetEditorError(active.id, null)
    store.easysshSetEditorText(active.id, '')
    store.easysshSetEditorLoading(active.id, true)
    setRetryCount(c => c + 1)
  }

  const download = async () => {
    if (!active) {
      return
    }
    const url = '/api/download?path=' + encodeURIComponent(active.path)
    const res = await window.api.fetch(url)
      .catch(() => null)
    if (!res) {
      store.easysshSetEditorError(active.id, 'Download failed')
      return
    }
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = active.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }

  const save = async (ed) => {
    const sftp = sftpRef.current || await ensureSftp(store, { ...tab, ...bm, id: tab.id })
    if (!sftp) {
      store.easysshSetEditorError(ed.id, 'SFTP not ready')
      return
    }
    try {
      await sftp.writeFile(ed.path, ed.text)
      store.easysshSetEditorDirty(ed.id, false)
      store.easysshSetEditorError(ed.id, null)
    } catch (e) {
      store.easysshSetEditorError(ed.id, 'Save failed: ' + (e.message || e))
    }
  }

  // Ctrl+S 保存
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        const ed = store.editors.find(x => x.id === store.easysshActiveEditorId)
        if (ed && ed.text !== '' && ed.loading === false) {
          save(ed)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [store.easysshActiveEditorId, store.editors.length])

  if (!editors.length) {
    return null
  }

  const editArea = (ed) => (
    <CodeMirrorEditor
      key={ed.id}
      value={ed.text}
      fileName={ed.name}
      onChange={(text) => store.easysshSetEditorText(ed.id, text)}
      onDirtyChange={(dirty) => store.easysshSetEditorDirty(ed.id, dirty)}
      onSave={() => save(ed)}
    />
  )

  return (
    <div className='easyssh-editor' style={{ height: height + 'px' }}>
      <div className='easyssh-editor-tabs'>
        {editors.map(ed => (
          <span
            key={ed.id}
            className={'easyssh-editor-tab' + (ed.type === 'log' ? ' easyssh-log-tab' : '') + (ed.id === store.easysshActiveEditorId ? ' active' : '')}
            title={ed.path || ed.name}
            onClick={() => {
              store.easysshActiveEditorId = ed.id
            }}
          >
            {ed.type === 'log' && <span className='easyssh-log-tab-dot'>●</span>}
            {ed.name}{!ed.dirty && ed.type !== 'log' ? '' : ''}{ed.dirty ? ' ●' : ''}
            {ed.error && <span className='easyssh-editor-tab-error'>!</span>}
            <CloseOutlined
              className='easyssh-editor-tab-close'
              onClick={(e) => {
                e.stopPropagation()
                if (ed.type === 'log') {
                  store.easysshCloseLog(ed.id)
                } else {
                  store.easysshCloseEditor(ed.id)
                }
              }}
            />
          </span>
        ))}
        <span className='easyssh-editor-spacer' />
        <span
          className={'easyssh-editor-save-btn' + (active && active.type === 'log' ? ' disabled' : '')}
          onClick={() => active && active.type !== 'log' && save(active)}
          title={active && active.type === 'log' ? 'Log monitor is read-only' : 'Ctrl+S'}
        >
          <SaveOutlined /> Save
        </span>
      </div>
      {editors.filter(ed => ed.type === 'log').map(lg => (
        <div
          key={lg.id}
          className='easyssh-editor-log-layer'
          style={{ display: lg.id === store.easysshActiveEditorId ? 'block' : 'none' }}
        >
          <LogMonitorView log={lg} serverId={lg.serverId} port={termPort} pid={tab ? tab.id : null} />
        </div>
      ))}
      {active && active.type !== 'log'
        ? (
            active.loading
              ? (
                <div className='easyssh-editor-loading'>Loading {active.path}…</div>
                )
              : active.error
                ? (
                  <div className='easyssh-editor-error'>
                    <div>Unable to open remote file</div>
                    <div className='easyssh-editor-error-detail'>{active.error}</div>
                    <div className='easyssh-editor-error-actions'>
                      <button className='easyssh-editor-retry' onClick={retry}>Retry</button>
                      <button className='easyssh-editor-download' onClick={download}>Download</button>
                    </div>
                  </div>
                  )
                : (
                    editArea(active)
                  )
          )
        : (
          <div className='easyssh-editor-empty'>Select a file in Explorer</div>
          )}
    </div>
  )
})
