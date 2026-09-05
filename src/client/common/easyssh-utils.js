/**
 * EasySSH 公共工具：服务器连接状态推断（只读，不伪造）
 *
 * 注意：本模块保持零依赖（不 import constants——其顶层依赖 window/electerm-resource），
 * 以便 scripts/tests 纯 node 单测直接 import。
 * connectionPanes 与 constants.js 的 paneMap 中"连接型 pane"保持一致：
 * ssh / terminal / fileManager。
 */
const connectionPanes = ['ssh', 'terminal', 'fileManager']

const isConnTab = (t, serverId) =>
  t.srcId === serverId && connectionPanes.includes(t.pane)

export function getServerState (store, bm) {
  const tabs = store.tabs.filter(t => isConnTab(t, bm.id))
  if (!tabs.length) {
    return { state: 'disconnected', tabs: [] }
  }
  // 任一 tab 已失败（连接错误/timeout）→ 整个服务器显示 failed
  const hasError = tabs.some(t => t.status === 'error')
  if (hasError) {
    return { state: 'error', tabs }
  }
  const connecting = tabs.some(t => t.status === 'processing')
  return { state: connecting ? 'connecting' : 'connected', tabs }
}

export const STATE_META = {
  connected: { dot: '●', cls: 'connected', label: 'Connected' },
  connecting: { dot: '◌', cls: 'connecting', label: 'Connecting' },
  error: { dot: '●', cls: 'error', label: 'Connection failed' },
  disconnected: { dot: '○', cls: 'disconnected', label: 'Disconnected' }
}

/**
 * 解析某个 Connection Profile 当前拥有的连接型 tab（Phase 4A-P0 §三十一）：
 * Explorer/Editor/GPU/Log 的 SFTP、exec、日志流必须使用「自己 serverId 对应的
 * Connection Runtime」，绝不复用"当前活动 tab"的连接，避免跨连接读写。
 * 优先返回未出错的 tab；全部失败时返回第一个（让上层走错误恢复路径）。
 */
export function getOwnerTab (store, serverId) {
  if (!serverId) {
    return null
  }
  const tabs = store.tabs.filter(t => isConnTab(t, serverId))
  return tabs.find(t => t.status !== 'error') || tabs[0] || null
}

export function getOwnerBookmark (store, serverId) {
  if (!serverId) {
    return null
  }
  return (store.bookmarks || []).find(b => b.id === serverId) || null
}
