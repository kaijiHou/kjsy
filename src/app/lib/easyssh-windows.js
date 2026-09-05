/**
 * EasySSH multi-window registry (Phase 4A-P0)
 *
 * 架构模型（见 docs/DEVLOG.md Phase 4A-P0）：
 *   Connection Profile (bookmark, 持久配置)
 *   ≠ Connection Runtime (session-server 子进程, per terminal tab)
 *   ≠ Window Workspace (一个 BrowserWindow 绑定一个 Connection)
 *   ≠ Terminal Tab (属于某个 Window Workspace)
 *
 * 主进程按 webContents.id 登记每个 BrowserWindow 绑定的 profileId，
 * 保证：
 *   - 已连接窗口选择另一个连接 → 打开新 BrowserWindow（不破坏当前窗口）
 *   - 选择已在其它窗口打开的连接 → focus 那个窗口（不复制）
 *   - 关闭单个窗口只回收它自己的 workspace；最后一个窗口关闭才退出应用
 */

const globalState = require('./glob-state')

// 惰性加载 electron-log：保证本模块可被纯 node 单测直接 require
function debugLog (...args) {
  try {
    const log = require('../common/log')
    log.debug(...args)
  } catch (e) {
    console.debug(...args)
  }
}

// webContents.id -> { profileId: string|null, win: BrowserWindow }
const registry = new Map()

function registerWindow (win, profileId) {
  if (!win || win.isDestroyed()) {
    return
  }
  registry.set(win.webContents.id, { profileId: profileId || null, win })
}

function unregisterWindow (win) {
  if (!win) {
    return
  }
  registry.delete(win.webContents.id)
}

function bindProfile (win, profileId) {
  if (!win || win.isDestroyed()) {
    return
  }
  const item = registry.get(win.webContents.id)
  if (item) {
    item.profileId = profileId || null
  } else {
    registry.set(win.webContents.id, { profileId: profileId || null, win })
  }
}

function alive (item) {
  return item && item.win && !item.win.isDestroyed()
}

function countAliveWindows () {
  let n = 0
  for (const item of registry.values()) {
    if (alive(item)) {
      n++
    }
  }
  return n
}

function countOtherAliveWindows (win) {
  let n = 0
  for (const item of registry.values()) {
    if (alive(item) && item.win.webContents.id !== (win && win.webContents.id)) {
      n++
    }
  }
  return n
}

function findWindowByProfile (profileId) {
  if (!profileId) {
    return null
  }
  for (const item of registry.values()) {
    if (alive(item) && item.profileId === profileId) {
      return item.win
    }
  }
  return null
}

function getAllAliveWindows () {
  const wins = []
  for (const item of registry.values()) {
    if (alive(item)) {
      wins.push(item.win)
    }
  }
  return wins
}

function getStartupProfileId (webContentsId) {
  const item = registry.get(webContentsId)
  return item && item.profileId ? item.profileId : null
}

function focusWindow (win) {
  if (!win || win.isDestroyed()) {
    return false
  }
  if (win.isMinimized()) {
    win.restore()
  }
  win.show()
  win.focus()
  return true
}

/**
 * 连接启动器（Connection Launcher）主进程入口：
 * - 该 profile 已在某个窗口打开 → focus 那个窗口
 * - 否则开一个新 BrowserWindow，由新窗口的 renderer 自动连接该 profile
 * 不向 URL/命令行/query 传递任何敏感信息（§十二），profileId 仅经 IPC 传递。
 */
async function openProfileWindow (profileId) {
  const existing = findWindowByProfile(profileId)
  if (existing) {
    focusWindow(existing)
    return { focused: true }
  }
  // 延迟 require 避免与 create-window 循环依赖
  const { createWindow } = require('./create-window')
  await createWindow({ easysshProfileId: profileId })
  return { created: true }
}

/**
 * 窗口关闭时的清理：返回 true 表示这是最后一个窗口（调用方执行完整退出），
 * false 表示还有其它窗口存活（仅回收本窗口，不动公共 server 子进程）。
 */
function onWindowClosing (win) {
  const others = countOtherAliveWindows(win)
  unregisterWindow(win)
  if (others > 0) {
    debugLog(`[EasySSH] window closed, ${others} workspace window(s) remain`)
    return false
  }
  return true
}

function isLastWindow (win) {
  return countOtherAliveWindows(win) === 0
}

module.exports = {
  registerWindow,
  unregisterWindow,
  bindProfile,
  countAliveWindows,
  countOtherAliveWindows,
  findWindowByProfile,
  getAllAliveWindows,
  getStartupProfileId,
  openProfileWindow,
  onWindowClosing,
  isLastWindow,
  focusWindow,
  // 测试钩子：主进程模块在渲染端测试里直接 require 会拉起 electron 依赖，
  // 这里保持纯 Map 逻辑可被 scripts/tests 单测覆盖（不触碰 electron API）。
  _registry: registry,
  _globalState: globalState
}
