import { auto } from 'manate/react'
import { Button, Empty, Tag } from 'antd'
import {
  DesktopOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  CodeOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import { paneMap } from '../../common/constants'
import {
  PRODUCT_NAME,
  PRODUCT_TAGLINE
} from '../../common/product'
import './dashboard.styl'

const e = window.translate

const DEFAULT_GROUP = '实验室服务器'

// 模块级"Files 打开"待切换队列：连接建立后把 tab 切到 SFTP pane
// 放模块级是为了不被组件卸载（Dashboard 被 tab 覆盖）打断
const pendingFiles = new Map() // tabId -> true
let pollIv = null
function ensureFilesPolling (store) {
  if (pollIv) {
    return
  }
  pollIv = setInterval(() => {
    let any = false
    for (const tabId of [...pendingFiles.keys()]) {
      const t = store.tabs.find(t2 => t2.id === tabId)
      if (!t) {
        pendingFiles.delete(tabId)
        continue
      }
      // 连接建立通常 2-6 秒，固定等待后切换（tab.status 是加载状态，不能用作连接判断）
      any = true
    }
    if (!any) {
      clearInterval(pollIv)
      pollIv = null
    }
  }, 1000)
}
function switchPendingFiles (store, tabId) {
  const t = store.tabs.find(t2 => t2.id === tabId)
  if (t) {
    t.pane = paneMap.fileManager
    store.activeTabId = t.id
  }
  pendingFiles.delete(tabId)
}
function scheduleFilesSwitch (store, tabId, delayMs = 4500) {
  pendingFiles.set(tabId, true)
  ensureFilesPolling(store)
  setTimeout(() => {
    switchPendingFiles(store, tabId)
  }, delayMs)
}

/**
 * 服务器连接状态（只读推断，不伪造）：
 * - 在 store.tabs 中找到 srcId 匹配的 ssh/sftp/terminal tab
 * - tab.status === 'processing' → connecting
 * - 有 tab 且非 processing → connected
 * - 无 tab → disconnected
 */
function getServerState (store, bm) {
  const tabs = store.tabs.filter(t =>
    t.srcId === bm.id &&
    (t.pane === paneMap.ssh || t.pane === paneMap.fileManager || t.pane === paneMap.terminal)
  )
  if (!tabs.length) {
    return { state: 'disconnected', tabs: [] }
  }
  const connecting = tabs.some(t => t.status === 'processing')
  return { state: connecting ? 'connecting' : 'connected', tabs }
}

const STATE_META = {
  connected: { dot: '●', cls: 'connected', label: 'Connected' },
  connecting: { dot: '◌', cls: 'connecting', label: 'Connecting' },
  disconnected: { dot: '○', cls: 'disconnected', label: 'Disconnected' }
}

function ServerCard ({ store, bm }) {
  const { state, tabs } = getServerState(store, bm)
  const meta = STATE_META[state]
  const gpuTxt = bm.easysshGpuModel
    ? `${bm.easysshGpuModel}${bm.easysshGpuCount ? ' × ' + bm.easysshGpuCount : ''}`
    : ''

  const openTerminal = () => {
    if (tabs.length) {
      // 已连接/连接中：激活并切到终端 pane
      store.activeTabId = tabs[0].id
      tabs[0].pane = paneMap.ssh
    } else {
      store.onSelectBookmark(bm.id)
    }
  }

  const openFiles = () => {
    const sftpTab = tabs.find(t => t.pane === paneMap.fileManager)
    if (sftpTab) {
      store.activeTabId = sftpTab.id
      return
    }
    if (tabs.length) {
      // 已连接：复用会话切文件管理 pane
      tabs[0].pane = paneMap.fileManager
      store.activeTabId = tabs[0].id
    } else {
      // 未连接：先打开 SSH 终端 tab（走 electerm 现有连接流程），
      // 连接建立后自动切换到 SFTP pane（sftp-entry 初始化依赖 ssh 会话）
      store.onSelectBookmark(bm.id)
      const tab = store.tabs.find(t => t.srcId === bm.id)
      if (tab) {
        scheduleFilesSwitch(store, tab.id)
      }
    }
  }

  return (
    <div className={'easyssh-card ' + meta.cls}>
      <div className='easyssh-card-head'>
        <span className='easyssh-card-title'>
          <DesktopOutlined /> {bm.title || bm.host}
        </span>
        <span className='easyssh-card-state' title={meta.label}>
          <span className='easyssh-state-dot'>{meta.dot}</span>
          {meta.label}
        </span>
      </div>
      <div className='easyssh-card-body'>
        <div className='easyssh-card-row'>
          <span className='easyssh-card-label'>Host</span>
          <span>{bm.host}:{bm.port || 22}</span>
        </div>
        <div className='easyssh-card-row'>
          <span className='easyssh-card-label'>User</span>
          <span>{bm.username || '-'}</span>
        </div>
        {gpuTxt && (
          <div className='easyssh-card-row'>
            <span className='easyssh-card-label'>GPU</span>
            <span className='easyssh-gpu'><ThunderboltOutlined /> {gpuTxt}</span>
          </div>
        )}
        {bm.description && (
          <div className='easyssh-card-row easyssh-card-desc'>
            <span className='easyssh-card-label'>备注</span>
            <span>{bm.description}</span>
          </div>
        )}
      </div>
      <div className='easyssh-card-actions'>
        <Button size='small' type='primary' onClick={openTerminal}>
          <CodeOutlined /> Terminal
        </Button>
        <Button size='small' onClick={openFiles}>
          <FolderOpenOutlined /> Files
        </Button>
      </div>
    </div>
  )
}

export default auto(function ServerDashboard (props) {
  const { store, height, onNewSsh } = props
  const servers = store.bookmarks.filter(b => b.type === 'ssh')

  const groups = {}
  servers.forEach(b => {
    const g = b.easysshGroup || DEFAULT_GROUP
    ;(groups[g] = groups[g] || []).push(b)
  })

  return (
    <div className='easyssh-dashboard' style={{ height: height + 'px' }}>
      <div className='easyssh-dashboard-head'>
        <div>
          <div className='easyssh-dashboard-title'>{PRODUCT_NAME}</div>
          <div className='easyssh-dashboard-tagline'>{PRODUCT_TAGLINE}</div>
        </div>
        <Button icon={<PlusOutlined />} onClick={onNewSsh}>
          {e('newBookmark')}
        </Button>
      </div>
      {servers.length === 0
        ? (
          <div className='easyssh-dashboard-empty'>
            <Empty description='还没有服务器，点击右上角「新建」添加第一台实验室服务器' />
          </div>
          )
        : (
            Object.keys(groups).map(group => (
              <div className='easyssh-group' key={group}>
                <div className='easyssh-group-title'>
                  <Tag color='geekblue'>{group}</Tag>
                  <span className='easyssh-group-count'>{groups[group].length} 台</span>
                </div>
                <div className='easyssh-card-grid'>
                  {groups[group].map(bm => (
                    <ServerCard store={store} bm={bm} key={bm.id} />
                  ))}
                </div>
              </div>
            ))
          )}
    </div>
  )
})
