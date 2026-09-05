/**
 * EasySSH Adapter —— 封装 electerm 现有 store 能力，供新 UI 调用
 * 只做能力编排，不新建任何 SSH/SFTP/Session 连接。
 */
import { paneMap } from '../common/constants'
import uid from '../common/id-with-stamp'

export default Store => {
  // 当前工作服务器（Workspace 上下文）
  Store.prototype.easysshSetActiveServer = function (bm) {
    this.easysshActiveServerId = bm ? bm.id : null
  }

  // ============ 多窗口（Phase 4A-P0） ============

  /**
   * 本窗口是否已持有任何连接型 tab（ssh/terminal/fileManager pane）
   * 用于 Connection Launcher 判定：空 Welcome 窗口原地连接 vs 打开新窗口
   */
  Store.prototype.easysshWindowHasConnection = function () {
    return this.tabs.some(t =>
      t.srcId &&
      (t.pane === paneMap.ssh || t.pane === paneMap.terminal || t.pane === paneMap.fileManager)
    )
  }

  /**
   * Connection Launcher（§五六）：
   * - 当前窗口无连接 → 原地建立连接（复用空窗口）
   * - 当前窗口已连接/连接中 → 打开/聚焦独立 BrowserWindow，绝不破坏当前窗口
   * - 目标 profile 已在其它窗口打开 → 主进程直接 focus 那个窗口（§九）
   */
  Store.prototype.easysshLaunchProfile = function (bm) {
    if (!bm) {
      return 'invalid'
    }
    if (this.easysshWindowHasConnection()) {
      if (typeof window !== 'undefined' && window.pre) {
        window.pre.runGlobalAsync('easysshOpenProfileWindow', bm.id)
          .catch(err => console.error('[EasySSH] open profile window failed', err))
      }
      return 'new-window'
    }
    this.easysshOpenServer(bm)
    return 'in-place'
  }

  /**
   * 启动自动连接：主进程创建窗口时绑定了 profileId → 本窗口数据就绪后原地连接
   * （新窗口第一帧保持 Welcome/Loading 态，不泄漏其它窗口的路径/上下文，§二十七）
   */
  Store.prototype.easysshAutoOpenStartup = function () {
    const pid = this.easysshStartupProfileId
    if (!pid) {
      return false
    }
    const bm = (this.bookmarks || []).find(b => b.id === pid)
    if (!bm) {
      console.warn('[EasySSH] startup profile not found:', pid)
      return false
    }
    this.easysshOpenServer(bm)
    return true
  }

  // ============ Remote Editor（远程文件编辑，读写复用 electerm SFTP） ============
  Store.prototype.easysshOpenEditor = function (serverId, path, name) {
    // 去重排除 log 项（type='log' 同 serverId+path 但语义不同——Edit 必须开文件 tab）
    const ex = this.editors.find(e => e.type !== 'log' && e.serverId === serverId && e.path === path)
    if (ex) {
      this.easysshActiveEditorId = ex.id
      return ex
    }
    const ed = {
      id: uid(),
      serverId,
      path,
      name,
      text: '',
      loading: true,
      dirty: false,
      error: null
    }
    this.editors.push(ed)
    this.easysshActiveEditorId = ed.id
    return ed
  }

  Store.prototype.easysshSetEditorText = function (id, text) {
    const ed = this.editors.find(e => e.id === id)
    if (!ed) {
      return
    }
    ed.text = text
    ed.loading = false
  }

  Store.prototype.easysshSetEditorLoading = function (id, loading) {
    const ed = this.editors.find(e => e.id === id)
    if (ed) {
      ed.loading = loading
    }
  }

  Store.prototype.easysshSetEditorDirty = function (id, dirty) {
    const ed = this.editors.find(e => e.id === id)
    if (ed) {
      ed.dirty = dirty
    }
  }

  Store.prototype.easysshSetEditorError = function (id, error) {
    const ed = this.editors.find(e => e.id === id)
    if (ed) {
      ed.error = error
      ed.loading = false
    }
  }

  Store.prototype.easysshCloseEditor = function (id) {
    const i = this.editors.findIndex(e => e.id === id)
    if (i >= 0) {
      this.editors.splice(i, 1)
    }
    if (this.easysshActiveEditorId === id) {
      const next = this.editors[this.editors.length - 1]
      this.easysshActiveEditorId = next ? next.id : null
    }
  }

  /**
   * 记录终端 cwd（OSC 633 Shell Integration 上报，按 tabId 存储）
   * 数据流：shell → OSC 633;P;Cwd= → command-tracker-addon → terminal.setCwd → session.setCwd → 这里
   */
  Store.prototype.setTabCwd = function (tabId, cwd) {
    if (typeof cwd === 'string' && cwd) {
      this.cwdMap[tabId] = cwd
    }
  }

  /**
   * 打开/切换服务器 Workspace：
   * 已有该服务器的活动 tab → 激活；没有 → 走 electerm 连接流程
   * 同时把本窗口绑定到该 profile（主进程 registry，供 Connection Launcher focus 判定）
   */
  Store.prototype.easysshOpenServer = function (bm) {
    this.easysshSetActiveServer(bm)
    if (bm && typeof window !== 'undefined' && window.pre) {
      window.pre.runGlobalAsync('easysshBindProfileWindow', bm.id)
        .catch(err => console.error('[EasySSH] bind profile window failed', err))
    }
    const tabs = this.tabs.filter(t =>
      t.srcId === bm.id &&
      (t.pane === paneMap.ssh || t.pane === paneMap.terminal || t.pane === paneMap.fileManager)
    )
    if (tabs.length) {
      this.activeTabId = tabs[0].id
    } else {
      this.onSelectBookmark(bm.id)
    }
  }

  /**
   * Workspace 打开终端视图：激活/切换到 ssh pane
   */
  Store.prototype.easysshOpenTerminal = function (bm) {
    this.easysshSetActiveServer(bm)
    const tabs = this.tabs.filter(t =>
      t.srcId === bm.id &&
      (t.pane === paneMap.ssh || t.pane === paneMap.terminal || t.pane === paneMap.fileManager)
    )
    if (tabs.length) {
      const sshTab = tabs.find(t => t.pane !== paneMap.fileManager) || tabs[0]
      sshTab.pane = paneMap.ssh
      this.activeTabId = sshTab.id
    } else {
      this.onSelectBookmark(bm.id)
    }
  }

  /**
   * Workspace 打开文件视图：激活/切换到 fileManager pane
   * （复用 electerm 的 pane 切换机制，未连接时先连接再切换）
   */
  Store.prototype.easysshOpenFiles = function (bm) {
    this.easysshSetActiveServer(bm)
    const tabs = this.tabs.filter(t =>
      t.srcId === bm.id &&
      (t.pane === paneMap.ssh || t.pane === paneMap.terminal || t.pane === paneMap.fileManager)
    )
    if (tabs.length) {
      const fTab = tabs.find(t => t.pane === paneMap.fileManager) || tabs[0]
      fTab.pane = paneMap.fileManager
      this.activeTabId = fTab.id
    } else {
      // 未连接：先打开 SSH 终端 tab，连接建立后自动切换（同 Dashboard 逻辑）
      this.onSelectBookmark(bm.id)
      const tab = this.tabs.find(t => t.srcId === bm.id)
      if (tab) {
        const tabId = tab.id
        setTimeout(() => {
          const t = this.tabs.find(t2 => t2.id === tabId)
          if (t) {
            t.pane = paneMap.fileManager
            this.activeTabId = t.id
          }
        }, 4500)
      }
    }
  }

  /**
   * 打开 Log Monitor（Phase 3C）：
   * 复用 editors 数组（manate 已可靠订阅）——log 项 type='log'，与文件 tab 并排
   * 同一服务器同一路径已打开 → focus 已有 tab；否则创建（上限 5 个）
   */
  Store.prototype.easysshOpenLog = function (serverId, path) {
    const editors = this.editors || []
    const existing = editors.find(e => e.type === 'log' && e.serverId === serverId && e.path === path)
    if (existing) {
      this.easysshActiveEditorId = existing.id
      return
    }
    const logs = editors.filter(e => e.type === 'log')
    if (logs.length >= 5) {
      return
    }
    const name = path.split('/').pop() || path
    const log = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      type: 'log',
      serverId,
      path,
      name,
      text: '',
      dirty: false
    }
    this.editors = [...editors, log]
    this.easysshActiveEditorId = log.id
  }

  /** 关闭 Log Monitor（移除 tab；stream 由组件卸载清理） */
  Store.prototype.easysshCloseLog = function (logId) {
    this.editors = (this.editors || []).filter(e => e.id !== logId)
    if (this.easysshActiveEditorId === logId) {
      this.easysshActiveEditorId = null
    }
  }
}
