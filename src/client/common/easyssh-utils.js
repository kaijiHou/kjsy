/**
 * EasySSH 公共工具：服务器连接状态推断（只读，不伪造）
 */
import { paneMap } from './constants'

export function getServerState (store, bm) {
  const tabs = store.tabs.filter(t =>
    t.srcId === bm.id &&
    (t.pane === paneMap.ssh || t.pane === paneMap.terminal || t.pane === paneMap.fileManager)
  )
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
