import { auto } from 'manate/react'
import { useEffect, useRef, useState } from 'react'
import {
  SyncOutlined,
  ReloadOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  FileOutlined,
  CloseOutlined
} from '@ant-design/icons'
import { ensureSftp, dropSftp, getTerminalPort } from '../../common/easyssh-sftp'
import { joinRemotePath } from '../../common/easyssh-path.mjs'
import { getServerState, getUsernameHome } from '../../common/easyssh-utils'
import './easyssh.styl'

// 有界等待：把"永不 settle 的 SFTP 调用"转换成可见错误（§三十/三十一），
// 只用于异常防护，正常路径零额外等待
function withTimeout (promise, ms, label) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(label + ' timed out (' + Math.round(ms / 1000) + 's)')), ms)
      Promise.resolve(promise).then(() => clearTimeout(t), () => clearTimeout(t))
    })
  ])
}

/**
 * Remote Explorer —— 左侧文件树
 * - 跟随当前活动终端 cwd（OSC 633 上报），可手动导航（自动暂停跟随）
 * - SFTP 复用 electerm 客户端（ensureSftp）
 * - 懒加载：只有展开目录时才 list
 */
export default auto(function RemoteExplorer (props) {
  const { store, tab, bm, defaultCwd, height, collapsed, width, onToggleCollapse } = props
  const [rootPath, setRootPath] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [sftpReady, setSftpReady] = useState(false)
  const [expanded, setExpanded] = useState({}) // path -> true（懒加载子项）
  const [children, setChildren] = useState({}) // dirPath -> items
  // An explicit bookmark path is the initial Explorer location.  Following
  // the terminal remains available through the sync button, but should not
  // immediately replace a configured path with the shell's cwd.
  const [follow, setFollow] = useState(!defaultCwd || defaultCwd === '~')
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const sftpRef = useRef(null)
  const autoRetriedRef = useRef(false)
  const rootRef = useRef('')
  const followRef = useRef(!defaultCwd || defaultCwd === '~')
  followRef.current = follow
  rootRef.current = rootPath

  // 终端 cwd 变化 → 跟随
  const cwd = (tab && store.cwdMap[tab.id]) || ''

  // The shell reuses this component while switching servers.  Clear the
  // previous server's listing and recompute the initial follow mode so a
  // configured path on one bookmark cannot leak into the next tab.
  useEffect(() => {
    setFollow(!defaultCwd || defaultCwd === '~')
    setRootPath('')
    setItems([])
    setExpanded({})
    setChildren({})
    setError('')
    setSftpReady(false)
    sftpRef.current = null
    autoRetriedRef.current = false
  }, [tab?.id, defaultCwd])

  useEffect(() => {
    if (tab && followRef.current && cwd && cwd !== rootRef.current) {
      setRootPath(cwd)
    }
  }, [cwd, tab])

  // 确保 SFTP 连接（Phase 4A-P0-EXPLORER：状态驱动，无定时器）
  // 依赖 tab.status：连接 processing→done、断线 error→done 时自动重新初始化，
  // 保证"新窗口 Terminal Connected 后 Explorer 自动加载"，无需手点 Retry（§二十/§二十七）。
  useEffect(() => {
    let disposed = false
    async function init () {
      if (!tab || !bm) {
        return
      }
      // 断线：立即失效本 tab 的 SFTP handle，禁止重连后复用旧 handle（§二十六）
      if (tab.status === 'error') {
        if (sftpRef.current) {
          console.info('[EasySSH Explorer] connection error, invalidate sftp handle', {
            tabId: tab.id,
            profileId: bm.id
          })
          dropSftp(tab.id)
          sftpRef.current = null
          setSftpReady(false)
        }
        return
      }
      const t0 = Date.now()
      try {
        // 注意：bm 展开会覆盖 id（bookmark id ≠ tab id），必须显式保留 tab.id
        const sftp = await ensureSftp(store, { ...tab, id: tab.id })
        if (disposed) {
          return
        }
        if (!sftp) {
          // 已连接却拿不到 SFTP 通道：这是真实异常，必须显式暴露（§五），
          // 绝不能静默 return 留在永恒 Loading
          const msg = 'SFTP channel not available (tab connected, no sftp handle) — click Retry'
          console.error('[EasySSH Explorer] init error', {
            tabId: tab.id,
            profileId: bm.id,
            serverStatus: tab.status,
            localPort: getTerminalPort(tab.id),
            error: msg,
            retryCount
          })
          if (tab.status !== 'processing') {
            setError(msg)
          }
          return
        }
        sftpRef.current = sftp
        setSftpReady(true)
        // 初始路径（§六 两级来源）：终端 cwd（若已上报）> SFTP realpath('.') >
        // home 兜底。绝不使用 '~' 字面量（SFTP 不做 shell 展开，§七）。
        // 每一级失败都记录原因；整体有界（12s），任何失败最终收敛为可见错误 + Retry，
        // 不允许永恒 Loading（§三十/§三十一）。
        const cwdNow = store.cwdMap[tab.id]
        const srcErrors = {}
        // 最后一级 fallback（§二十九，与 upstream sftp-entry.getPwd 对齐）：
        // root → /root，其余 → /home/<username>；仅供 list 验证，失败会显式报错
        const usernameHome = getUsernameHome(bm.username)
        const initial = (defaultCwd && defaultCwd !== '~') ||
          cwdNow ||
          await withTimeout(sftp.realpath('.'), 12000, 'realpath')
            .catch(e => {
              srcErrors.realpath = e.message
              console.warn('[EasySSH Explorer] realpath fallback failed', { tabId: tab.id, error: e.message })
              return ''
            }) ||
          await withTimeout(sftp.getHomeDir(), 12000, 'home')
            .catch(e => {
              srcErrors.home = e.message
              console.warn('[EasySSH Explorer] home fallback failed', { tabId: tab.id, error: e.message })
              return ''
            }) ||
          usernameHome
        console.info('[EasySSH Explorer] init result', {
          tabId: tab.id,
          profileId: bm.id,
          serverStatus: tab.status,
          localPort: getTerminalPort(tab.id),
          sftpReady: true,
          cwdFromTerminal: cwdNow || null,
          initialPath: initial || null,
          pathSource: (defaultCwd && defaultCwd !== '~') ? 'bookmark' : (cwdNow ? 'cwd' : (initial && initial !== usernameHome ? 'sftp-home' : (initial ? 'username' : 'none'))),
          srcErrors: Object.keys(srcErrors).length ? srcErrors : null,
          elapsed: Date.now() - t0,
          retryCount
        })
        if (initial && typeof initial === 'string') {
          setRootPath(initial)
        } else if (!disposed && tab.status !== 'processing') {
          // SFTP 就绪但解析不到路径：可能是降级/损坏的 sftp handle。
          // 自动重建一次（ref 防循环）；再失败才显式报错 + 手动 Retry
          if (!autoRetriedRef.current) {
            autoRetriedRef.current = true
            console.warn('[EasySSH Explorer] path resolution empty, rebuild sftp handle once', {
              tabId: tab.id,
              profileId: bm.id,
              srcErrors
            })
            dropSftp(tab.id)
            sftpRef.current = null
            setSftpReady(false)
            setRetryCount(c => c + 1)
          } else {
            const detail = Object.keys(srcErrors).length
              ? Object.entries(srcErrors).map(([k, v]) => k + ': ' + v).join('; ')
              : 'no path source available'
            setError('Cannot resolve remote directory (' + detail + ')')
          }
        }
      } catch (e) {
        if (disposed) {
          return
        }
        console.error('[EasySSH Explorer] init error', {
          tabId: tab.id,
          profileId: bm.id,
          serverStatus: tab.status,
          localPort: getTerminalPort(tab.id),
          error: e.message
        })
        // 连接建立中失败（例如认证完成前 SFTP 通道未就绪）：不报错，
        // 等 status 翻转自动重试；已连接后的失败才是真异常，显示错误 + Retry
        if (tab.status !== 'processing') {
          setError(e.message || 'SFTP init failed')
        }
      }
    }
    init()
    return () => {
      disposed = true
    }
  }, [tab?.id, tab?.status, retryCount, defaultCwd])

  // Retry 必须重新 resolve live runtime（§十九）：丢弃缓存 handle 再重建，
  // 不能复用陈旧 path/handle/session
  const retryInit = () => {
    console.info('[EasySSH Explorer] retry', {
      tabId: tab ? tab.id : null,
      profileId: bm ? bm.id : null,
      serverStatus: tab ? tab.status : null,
      localPort: tab ? getTerminalPort(tab.id) : null,
      explorerPath: rootRef.current || null,
      retryCount
    })
    setError('')
    setSftpReady(false)
    if (tab) {
      dropSftp(tab.id)
    }
    sftpRef.current = null
    setRetryCount(c => c + 1)
  }
  // 列目录（rootPath 变化或 SFTP 就绪）
  // 路径为空/未就绪时不发请求 —— 服务端永远不会收到 undefined/null 路径
  useEffect(() => {
    if (!rootPath || typeof rootPath !== 'string' || !sftpReady || !sftpRef.current) {
      return
    }
    let disposed = false
    setLoading(true)
    setError('')
    sftpRef.current.list(rootPath)
      .then(list => {
        if (disposed) {
          return
        }
        setItems(sortItems(list))
        setLoading(false)
      })
      .catch(e => {
        if (disposed) {
          return
        }
        console.error('[EasySSH Explorer] list error', {
          tabId: tab ? tab.id : null,
          profileId: bm ? bm.id : null,
          serverStatus: tab ? tab.status : null,
          explorerPath: rootPath,
          error: e.message || String(e)
        })
        setError('Cannot open remote directory ' + rootPath + ': ' + (e.message || 'list failed'))
        setLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [rootPath, sftpReady])

  const goPath = (p) => {
    setFollow(false)
    setRootPath(p)
    setExpanded({})
  }

  // 排序：目录优先 + 名称升序（一次完成，渲染前；不反复 sort）
  const sortItems = (list) => [...(list || [])].sort((a, b) => {
    const ad = a.type === 'd' || a.isDirectory ? 0 : 1
    const bd = b.type === 'd' || b.isDirectory ? 0 : 1
    if (ad !== bd) return ad - bd
    return a.name.localeCompare(b.name)
  })

  const syncWithTerminal = () => {
    if (tab && store.cwdMap[tab.id]) {
      setFollow(true)
      setRootPath(store.cwdMap[tab.id])
    }
  }

  const toggleDir = async (path) => {
    if (expanded[path]) {
      const nx = { ...expanded }
      delete nx[path]
      setExpanded(nx)
      return
    }
    setExpanded({ ...expanded, [path]: true })
    if (children[path] === undefined && sftpRef.current) {
      try {
        // 展开 readdir 超时保护：服务器大目录/挂起时 10s 放弃，
        // 避免 loading 占位（…）无限停留留下空白区
        const list = await Promise.race([
          sftpRef.current.list(path),
          new Promise((resolve, reject) => setTimeout(() => reject(new Error('readdir timeout (10s)')), 10000))
        ])
        setChildren({ ...children, [path]: sortItems(list) })
      } catch (e) {
        console.error('explorer expand error', e)
        // 失败：置空 children——卸载 loading 占位（不留空白）
        setChildren({ ...children, [path]: [] })
      }
    }
  }

  const openFile = (file, path) => {
    if (!bm) {
      return
    }
    store.easysshOpenEditor(bm.id, path, file.name)
  }

  const refresh = async () => {
    if (!rootPath) {
      return
    }
    setLoading(true)
    setError('')
    try {
      // SFTP 连接可能已断开/未建立：null 时重建（共享连接管理器，不等待 15s）
      let sftp = sftpRef.current
      if (!sftp) {
        sftp = await ensureSftp(store, { ...tab, id: tab.id })
        sftpRef.current = sftp
        setSftpReady(true)
      }
      const list = await sftp.list(rootPath)
      // 新数组引用保证 React 重渲染（即使内容相同）
      setItems(sortItems(list))
      setLoading(false)
    } catch (e) {
      // 缓存连接已断：force 重建一次再试
      try {
        const sftp = await ensureSftp(store, { ...tab, id: tab.id }, true)
        sftpRef.current = sftp
        setSftpReady(true)
        const list = await sftp.list(rootPath)
        setItems(sortItems(list))
      } catch (e2) {
        setError(e2.message || 'refresh failed')
      }
      setLoading(false)
    }
  }

  // 文件行操作菜单（View/Edit/Monitor Log）
  const [menuFor, setMenuFor] = useState(null)

  useEffect(() => {
    const close = () => setMenuFor(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const openFileMenu = (e, path) => {
    e.stopPropagation()
    setMenuFor(path)
  }

  const fileMenuAction = (action, item, path) => {
    setMenuFor(null)
    if (!item) {
      return
    }
    if (action === 'monitor') {
      store.easysshOpenLog(store.easysshActiveServerId, path)
    } else {
      openFile(item, path)
    }
  }

  const isVisible = (item) => !item.name.startsWith('.') || item.type === 'd' || item.isDirectory

  const renderItem = (item, parentPath = rootPath) => {
    const isDir = item.type === 'd' || item.isDirectory
    const path = joinRemotePath(parentPath, item.name)
    if (isDir) {
      const open = !!expanded[path]
      return (
        <div key={path}>
          <div
            className={'easyssh-explorer-item' + (open ? ' open' : '')}
            onClick={() => toggleDir(path)}
            onDoubleClick={() => goPath(path)}
            title={item.name}
          >
            {open ? <FolderOpenOutlined className='easyssh-explorer-icon dir' /> : <FolderOutlined className='easyssh-explorer-icon dir' />}
            <span className='easyssh-explorer-name'>{item.name}</span>
          </div>
          {open && (children[path] !== undefined
            ? (
              <div className='easyssh-explorer-children'>
                {children[path].filter(isVisible).map(child => renderItem(child, path))}
              </div>
              )
            : (
              <div className='easyssh-explorer-children easyssh-explorer-loading'>…</div>
              ))}
        </div>
      )
    }
    return (
      <div
        key={path}
        className='easyssh-explorer-item'
        onClick={() => openFile(item, path)}
        title={item.name}
      >
        <FileOutlined className='easyssh-explorer-icon' />
        <span className='easyssh-explorer-name'>{item.name}</span>
        <span
          className='easyssh-explorer-file-menu'
          onClick={(e) => openFileMenu(e, path)}
          title='File actions'
        >
          ···
        </span>
        {menuFor === path && (
          <div className='easyssh-explorer-menu' onClick={(e) => e.stopPropagation()}>
            <div className='easyssh-explorer-menu-item' onClick={() => fileMenuAction('edit', item, path)}>Edit</div>
            <div className='easyssh-explorer-menu-item' onClick={() => fileMenuAction('monitor', item, path)}>Monitor Log</div>
          </div>
        )}
      </div>
    )
  }

  if (collapsed) {
    return (
      <div className='easyssh-explorer-collapsed' onClick={onToggleCollapse} title='Show Explorer'>
        <FolderOpenOutlined />
      </div>
    )
  }

  // 连接状态（§二十四/§二十九）：
  // - 连接建立中 → Waiting，绝不能把内部初始化错误当正常状态展示
  // - 连接失败/断开 → Disconnected，不显示旧目录也不允许操作
  // - 真实的 list/init 失败才显示错误 + Retry
  const connState = bm ? getServerState(store, bm).state : 'disconnected'
  const waitingForConnection = connState === 'connecting' || (connState === 'disconnected' && tab && tab.status === 'processing')

  return (
    <div className='easyssh-explorer' style={{ width: width + 'px', height: height + 'px' }}>
      <div className='easyssh-explorer-head'>
        <span className='easyssh-explorer-path'>{rootPath || (follow && cwd) || '—'}</span>
        <span className='easyssh-explorer-actions'>
          <span
            className={'easyssh-explorer-action' + (follow ? ' active' : '')}
            onClick={syncWithTerminal}
            title='Follow terminal directory'
          >
            <SyncOutlined />
          </span>
          <span className='easyssh-explorer-action' onClick={refresh} title='Refresh'>
            <ReloadOutlined />
          </span>
          <span className='easyssh-explorer-action' onClick={onToggleCollapse} title='Collapse explorer'>
            <CloseOutlined />
          </span>
        </span>
      </div>
      {!tab
        ? (
          <div className='easyssh-explorer-empty'>Connect a server to browse files</div>
          )
        : connState === 'error'
          ? (
            <div className='easyssh-explorer-error'>
              <div>Disconnected</div>
              <div className='easyssh-explorer-error-detail'>Reconnect the server to browse files</div>
              <button className='easyssh-explorer-retry' onClick={retryInit}>Retry</button>
            </div>
            )
          : error
            ? (
              <div className='easyssh-explorer-error'>
                <div>Unable to load remote files</div>
                <div className='easyssh-explorer-error-detail'>{error}</div>
                <button className='easyssh-explorer-retry' onClick={retryInit}>Retry</button>
              </div>
              )
            : waitingForConnection || !sftpReady || !rootPath
              ? (
                <div className='easyssh-explorer-loading'>
                  {waitingForConnection ? 'Waiting for connection…' : 'Loading remote files…'}
                </div>
                )
              : loading && !items.length
                ? (
                  <div className='easyssh-explorer-loading'>Loading…</div>
                  )
                : items.length === 0
                  ? (
                    <div className='easyssh-explorer-empty'>(empty)</div>
                    )
                  : (
                    <div className='easyssh-explorer-tree'>
                      {items.filter(isVisible).map(item => renderItem(item))}
                    </div>
                    )}
    </div>
  )
})
