import { auto } from 'manate/react'
import { useEffect, useRef, useState } from 'react'
import { Dropdown } from 'antd'
import {
  DownOutlined,
  PlusOutlined,
  FolderOpenOutlined,
  ThunderboltOutlined,
  CodeOutlined
} from '@ant-design/icons'
import RemoteExplorer from './explorer'
import EditorPanel from './editor-panel'
import EasySshTerminalChrome from './terminal-chrome'
import GpuPanel from './gpu-panel'
import TaskPanel from './task-panel'
import Welcome from './welcome'
import fetch from '../../common/fetch-from-server'
import { getServerState, STATE_META } from '../../common/easyssh-utils'
import { PRODUCT_NAME } from '../../common/product'
import { refs } from '../common/ref'
import './easyssh-tokens.styl'
import './easyssh.styl'

const EXPLORER_MIN = 160
const EXPLORER_MAX = 420
const EXPLORER_DEFAULT = 240
const EDITOR_MIN_RATIO = 0.1
const EDITOR_MAX_RATIO = 0.9
const DEFAULT_EDITOR_RATIO = 0.65

/**
 * EasySSH App Shell（最终布局）：
 * 顶栏（品牌 + 服务器切换 + 状态）+ 左侧 Remote Explorer + 右侧 Workspace（Editor + Terminal）
 */
export default auto(function EasySshShell (props) {
  const { store, height, children } = props
  const servers = store.bookmarks.filter(b => b.type === 'ssh')
  const activeBm = servers.find(b => b.id === store.easysshActiveServerId) || null

  // 当前活动终端 tab（该服务器的）
  const activeTab = activeBm
    ? store.tabs.find(t => t.id === store.activeTabId && t.srcId === activeBm.id) ||
      store.tabs.find(t => t.srcId === activeBm.id)
    : null

  // Explorer 宽度 / 收起（持久化）
  const [explorerWidth, setExplorerWidth] = useState(() => {
    const v = Number(window.localStorage.getItem('easyssh-explorer-width'))
    return v >= EXPLORER_MIN && v <= EXPLORER_MAX ? v : EXPLORER_DEFAULT
  })
  const [explorerCollapsed, setExplorerCollapsed] = useState(() => {
    return window.localStorage.getItem('easyssh-explorer-collapsed') === '1'
  })
  // GPU Status Panel（Phase 3A——手动打开/关闭，无自动轮询）
  const [gpuOpen, setGpuOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)

  // Editor/Terminal 竖向分栏（可拖 + 折叠/最大化）
  const [editorRatio, setEditorRatio] = useState(DEFAULT_EDITOR_RATIO)
  const [terminalCollapsed, setTerminalCollapsed] = useState(false)
  const [terminalMaximized, setTerminalMaximized] = useState(false)
  const termBodyRef = useRef(null)
  const termBodyObsRef = useRef(null)

  // Terminal 容器尺寸变化 → xterm fit（复用 electerm 现有 onResize：
  // 自带 200ms throttle + isElementVisible 防御 + fit 后触发 PTY setWindow 链）
  // 用 ref callback：term-body 实际渲染时才注册（editor 打开/折叠恢复都会触发）
  const setTermBody = (el) => {
    if (termBodyRef.current === el) {
      return
    }
    termBodyRef.current = el
    if (termBodyObsRef.current) {
      termBodyObsRef.current.disconnect()
      termBodyObsRef.current = null
    }
    if (el) {
      const ro = new window.ResizeObserver(() => {
        // 尺寸 0（折叠中）不触发，避免 0×0 PTY resize
        if (el.clientHeight <= 0 || el.clientWidth <= 0) {
          return
        }
        const t = store.tabs.find(x => x.id === store.activeTabId)
        if (t) {
          const inst = refs.get('term-' + t.id)
          if (inst && inst.onResize) {
            inst.onResize()
          }
        }
      })
      ro.observe(el)
      termBodyObsRef.current = ro
      // 新挂载兜底：注册后立即 fit 一次（React 条件渲染偶发重挂 term-body，
      // 新 ResizeObserver 对初始尺寸不触发，主动补一次保证尺寸正确）
      const t0 = store.tabs.find(x => x.id === store.activeTabId)
      if (t0) {
        const inst0 = refs.get('term-' + t0.id)
        if (inst0 && inst0.onResize) {
          inst0.onResize()
        }
      }
    }
  }

  // 分栏拖动（实时，不依赖 mouseup）
  const splitDragRef = useRef(null)
  const onSplitterDown = (e) => {
    e.preventDefault()
    splitDragRef.current = {
      startY: e.clientY,
      startRatio: editorRatio
    }
    const move = (ev) => {
      const d = splitDragRef.current
      if (!d) {
        return
      }
      const ratio = d.startRatio + (ev.clientY - d.startY) / workspaceHeight
      setEditorRatio(Math.min(EDITOR_MAX_RATIO, Math.max(EDITOR_MIN_RATIO, ratio)))
      setTerminalCollapsed(false)
      // xterm fit 由 term-body 的 ResizeObserver → inst.onResize() 负责
    }
    const up = () => {
      splitDragRef.current = null
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // 宽度拖拽
  const resizingRef = useRef(false)
  const onResizeStart = (e) => {
    e.preventDefault()
    resizingRef.current = true
    const move = (ev) => {
      if (!resizingRef.current) {
        return
      }
      const w = Math.min(EXPLORER_MAX, Math.max(EXPLORER_MIN, ev.clientX))
      setExplorerWidth(w)
      window.localStorage.setItem('easyssh-explorer-width', String(w))
    }
    const up = () => {
      resizingRef.current = false
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const toggleCollapse = () => {
    const nx = !explorerCollapsed
    setExplorerCollapsed(nx)
    window.localStorage.setItem('easyssh-explorer-collapsed', nx ? '1' : '0')
  }

  const serverState = activeBm ? getServerState(store, activeBm).state : 'disconnected'
  const meta = STATE_META[serverState]

  // §六十六：窗口标题带 profile（Alt+Tab 可分辨）；不含任何密码/secret（§六十七）
  useEffect(() => {
    const bmTitle = activeBm ? (activeBm.title || activeBm.host) : ''
    const who = activeBm && activeBm.username ? ` - ${activeBm.username}@${activeBm.host}:${activeBm.port || 22}` : ''
    document.title = activeBm ? `${PRODUCT_NAME} - ${bmTitle}${who}` : PRODUCT_NAME
  }, [activeBm && activeBm.id, activeBm && activeBm.username])

  const menuItems = [
    ...servers.map(b => {
      const isCurrent = activeBm && b.id === activeBm.id
      return {
        key: b.id,
        label: (
          <span className='easyssh-menu-server'>
            <span className={'easyssh-menu-dot ' + STATE_META[getServerState(store, b).state].cls}>
              {STATE_META[getServerState(store, b).state].dot}
            </span>
            {b.title || b.host}
            <span className='easyssh-menu-host'>{b.host}</span>
            <span className='easyssh-menu-hint'>
              {isCurrent ? 'Current' : 'Open in new window'}
            </span>
          </span>
        )
      }
    }),
    { type: 'divider' },
    { key: '__create__', label: '+ Create Connection' },
    { key: '__manage__', label: 'Manage Servers…' }
  ]

  const onMenuClick = ({ key }) => {
    if (key === '__manage__') {
      store.openSetting()
      return
    }
    if (key === '__create__') {
      store.onNewSsh()
      return
    }
    const bm = servers.find(b => b.id === key)
    if (bm) {
      // Connection Launcher：空窗口原地连接，已连接窗口开新窗口（Phase 4A-P0）
      store.easysshLaunchProfile(bm)
    }
  }

  // Editor 打开时占 Workspace 上方（可拖比例；Terminal 折叠时 Editor 全占）
  const workspaceHeight = height - 44
  // 有编辑器或 Log Monitor 时渲染 editor 区（Log Monitor 复用该区域）
  const hasEditor = store.editors.length > 0
  const termRatio = terminalCollapsed
    ? 0
    : terminalMaximized
      ? 0.9
      : (1 - editorRatio)
  const editorH = hasEditor ? Math.round(workspaceHeight * (1 - termRatio)) : 0
  const termH = workspaceHeight - editorH

  // Editor 打开/关闭、Terminal 折叠/恢复时保险触发 fit
  // （ResizeObserver 在这些 React 条件渲染切换时偶发不触发，主动补一次）
  useEffect(() => {
    const t = store.tabs.find(x => x.id === store.activeTabId)
    if (t) {
      const inst = refs.get('term-' + t.id)
      if (inst && inst.onResize) {
        inst.onResize()
      }
    }
  }, [hasEditor, terminalCollapsed])

  return (
    <div className='easyssh-shell'>
      <div className='easyssh-topbar'>
        <span className='easyssh-brand'>{PRODUCT_NAME}</span>
        <Dropdown
          menu={{ items: menuItems, onClick: onMenuClick }}
          trigger={['click']}
          placement='bottomLeft'
        >
          <span className='easyssh-server-select' title='Switch server'>
            {activeBm ? (activeBm.title || activeBm.host) : 'Select Server'}
            <DownOutlined className='easyssh-server-select-arrow' />
          </span>
        </Dropdown>
        {activeBm && (
          <span className={'easyssh-topbar-state ' + meta.cls}>
            {meta.dot} {meta.label}
          </span>
        )}
        {activeBm && (
          <span
            className='easyssh-topbar-icon easyssh-gpu-entry'
            onClick={() => {
              setTaskOpen(false)
              setGpuOpen(true)
            }}
            title='GPU Status'
          >
            <ThunderboltOutlined /> GPU
          </span>
        )}
        {activeBm && (
          <span
            className='easyssh-topbar-icon easyssh-task-entry'
            onClick={() => {
              setGpuOpen(false)
              setTaskOpen(true)
            }}
            title='Remote Tasks'
          >
            <CodeOutlined /> Tasks
          </span>
        )}
        <span className='easyssh-topbar-spacer' />
        <span
          className='easyssh-topbar-icon'
          onClick={() => store.onNewSsh()}
          title='Add Server'
        >
          <PlusOutlined />
        </span>
      </div>
      <GpuPanel
        open={gpuOpen}
        onClose={() => setGpuOpen(false)}
        tabId={activeTab ? activeTab.id : null}
        wsFetch={fetch}
      />
      <TaskPanel
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        tabId={activeTab ? activeTab.id : null}
        serverId={activeBm ? activeBm.id : null}
        defaultCwd={(activeTab && store.cwdMap[activeTab.id]) || (activeBm && activeBm.easysshDefaultRemotePath) || '~'}
        wsFetch={fetch}
        onOpenLog={(serverId, path) => store.easysshOpenLog(serverId, path)}
      />
      {!activeTab
        ? (
          <Welcome
            store={store}
            height={workspaceHeight}
          />
          )
        : (
          <div className='easyssh-body' style={{ height: workspaceHeight + 'px' }}>
            {explorerCollapsed
              ? (
                <div className='easyssh-explorer-collapsed' onClick={toggleCollapse} title='Show Explorer'>
                  <FolderOpenOutlined />
                </div>
                )
              : (
                <>
                  <RemoteExplorer
                    store={store}
                    tab={activeTab}
                    bm={activeBm}
                    defaultCwd={activeBm && activeBm.easysshDefaultRemotePath}
                    height={workspaceHeight}
                    width={explorerWidth}
                    collapsed={false}
                    onToggleCollapse={toggleCollapse}
                  />
                  <div className='easyssh-explorer-resizer' onMouseDown={onResizeStart} />
                </>
                )}
            <div className='easyssh-workspace' key='easyssh-workspace'>
              {hasEditor && (
                <>
                  <EditorPanel
                    store={store}
                    bm={activeBm}
                    tab={activeTab}
                    height={editorH}
                  />
                  {!terminalCollapsed && (
                    <div
                      className='easyssh-splitter'
                      onMouseDown={onSplitterDown}
                      title='Drag to resize'
                    />
                  )}
                </>
              )}
              <div className='easyssh-workspace-terminal' style={{ height: (terminalCollapsed ? 32 : termH) + 'px' }}>
                <EasySshTerminalChrome
                  store={store}
                  bm={activeBm}
                  height={32}
                  collapsed={terminalCollapsed}
                  maximized={terminalMaximized}
                  onToggleCollapse={() => setTerminalCollapsed(!terminalCollapsed)}
                  onToggleMaximize={() => setTerminalMaximized(!terminalMaximized)}
                />
                {!terminalCollapsed && (
                  <div className='easyssh-workspace-term-body' ref={setTermBody}>
                    {children}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
    </div>
  )
})
