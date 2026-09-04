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
import { ensureSftp } from '../../common/easyssh-sftp'
import { joinRemotePath } from '../../common/easyssh-path.mjs'
import './easyssh.styl'

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
  }, [tab?.id, defaultCwd])

  useEffect(() => {
    if (tab && followRef.current && cwd && cwd !== rootRef.current) {
      setRootPath(cwd)
    }
  }, [cwd, tab])

  // 确保 SFTP 连接
  useEffect(() => {
    let disposed = false
    async function init () {
      if (!tab || !bm) {
        return
      }
      try {
        // 注意：bm 展开会覆盖 id（bookmark id ≠ tab id），必须显式保留 tab.id
        const sftp = await ensureSftp(store, { ...tab, ...pickAuth(bm), id: tab.id })
        if (disposed || !sftp) {
          return
        }
        sftpRef.current = sftp
        setSftpReady(true)
        // 初始路径：显式书签目录优先，其次终端 cwd，最后用 SFTP home 兜底。
        const initial = (defaultCwd && defaultCwd !== '~') || store.cwdMap[tab.id] || await sftp.getHomeDir().catch(() => '')
        if (initial) {
          setRootPath(initial)
        }
      } catch (e) {
        console.error('explorer sftp init error', e)
        setError(e.message || 'SFTP init failed')
      }
    }
    init()
    return () => {
      disposed = true
    }
  }, [tab?.id, retryCount, defaultCwd])

  const retryInit = () => {
    setError('')
    setSftpReady(false)
    setRetryCount(c => c + 1)
  }

  // rootPath 变化（或 SFTP 就绪）→ 列目录
  useEffect(() => {
    if (!rootPath || !sftpReady || !sftpRef.current) {
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
        console.error('explorer list error', e)
        setError(e.message || 'list failed')
        setLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [rootPath, sftpReady])

  const pickAuth = (bm) => {
    // tab 对象已含认证字段，此处仅保证关键字段存在
    return bm
  }

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
        sftp = await ensureSftp(store, { ...tab, ...pickAuth(bm), id: tab.id })
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
        const sftp = await ensureSftp(store, { ...tab, ...pickAuth(bm), id: tab.id }, true)
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
        : error
          ? (
            <div className='easyssh-explorer-error'>
              <div>Unable to load remote files</div>
              <div className='easyssh-explorer-error-detail'>{error}</div>
              <button className='easyssh-explorer-retry' onClick={retryInit}>Retry</button>
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
