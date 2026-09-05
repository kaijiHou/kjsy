/**
 * ipc main
 */

const {
  ipcMain,
  app,
  BrowserWindow,
  dialog,
  powerMonitor,
  globalShortcut,
  shell
} = require('electron')
const globalState = require('./glob-state')
const ipcSyncFuncs = require('./ipc-sync')
const { dbAction } = require('./db')
const { listItermThemes } = require('./iterm-theme')
const installSrc = require('./install-src')
const { getConfig } = require('./get-config')
const loadSshConfig = require('./ssh-config')
const {
  listWidgets,
  runWidget,
  stopWidget,
  runWidgetFunc
} = require('../widgets/load-widget')
const {
  checkMigrate,
  migrate
} = require('../migrate/migrate-1-to-2')
const {
  setPassword,
  checkPassword
} = require('./auth')
const initServer = require('./init-server')
const {
  getLang,
  loadLocales
} = require('./locales')
const { saveUserConfig } = require('./user-config-controller')
const { changeHotkeyReg, initShortCut } = require('./shortcut')
const lastStateManager = require('./last-state')
const {
  registerDeepLink,
  unregisterDeepLink,
  checkProtocolRegistration,
  getPendingDeepLink
} = require('./deep-link')
const {
  packInfo,
  appPath,
  isMac,
  exePath,
  isPortable,
  sshKeysPath
} = require('../common/app-props')
const {
  getScreenSize,
  maximize,
  unmaximize
} = require('./window-control')
const { openFileWithEditor } = require('./open-file-with-editor')
const { loadFontList } = require('./font-list')
const { checkDbUpgrade, doUpgrade } = require('../upgrade')
const { listSerialPorts } = require('./serial-port')
const initApp = require('./init-app')
const { encryptAsync, decryptAsync } = require('./enc')
const { safeEncrypt, safeDecrypt } = require('./safe-storage')
const { initCommandLine } = require('./command-line')
const { watchFile, unwatchFile } = require('./watch-file')
const lookup = require('../common/lookup')
const { AIchat, AIchatWithTools, getStreamContent, stopStream } = require('./ai')
const easysshWindows = require('./easyssh-windows')

// Security: whitelist of safe environment variables for Linux/Mac/Windows
const SAFE_ENV_KEYS = [
  'SHELL', 'TERM', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'COLORTERM',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'LC_TERMINAL', 'LC_TERMINAL_VERSION',
  'HOME', 'USER', 'LOGNAME', 'USERNAME',
  'PATH', 'PATHEXT',
  'TMPDIR', 'TMP', 'TEMP',
  'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'XDG_RUNTIME_DIR',
  'XDG_DATA_DIRS', 'XDG_CONFIG_DIRS', 'XDG_CURRENT_DESKTOP', 'XDG_SEAT', 'XDG_VTNR',
  'SSH_AUTH_SOCK', 'SSH_AGENT_PID', 'SSH_CLIENT', 'SSH_CONNECTION', 'SSH_TTY',
  'NODE_PATH', 'NODE_ENV', 'NVM_DIR', 'NVM_BIN',
  'NPM_CONFIG_PREFIX', 'NPM_CONFIG_CACHE',
  'GIT_EDITOR', 'GIT_PAGER', 'GIT_TERMINAL_PROMPT',
  'EDITOR', 'VISUAL', 'PAGER',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramFiles(x86)', 'CommonProgramFiles',
  'ComSpec', 'SystemRoot', 'SystemDrive', 'USERPROFILE', 'USERDOMAIN',
  'COMPUTERNAME', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
  'Apple_PubSub_Socket_Render',
  'DBUS_SESSION_BUS_ADDRESS', 'DESKTOP_SESSION', 'GNOME_DESKTOP_SESSION_ID', 'KDE_FULL_SESSION',
  'CI', 'DOCKER_HOST', 'CONTAINER'
]

async function initAppServer () {
  const {
    config
  } = await getConfig(globalState.get('serverInited'))
  const {
    langs,
    langMap,
    sysLocale
  } = await loadLocales()
  const language = getLang(config, sysLocale, langs)
  config.language = language
  globalState.set('langMap', langMap)
  if (!globalState.get('serverInited')) {
    const child = await initServer(config, {
      ...process.env,
      appPath,
      sshKeysPath
    }, sysLocale)
    child.on('message', (m) => {
      if (m && m.showFileInFolder) {
        if (!isMac) {
          shell.showItemInFolder(m.showFileInFolder)
        }
      }
    })
    globalState.set('serverInited', true)
  }
  globalState.set('config', config)
}

function initIpc () {
  // 多窗口：createWindow 会被多次调用，IPC handler 只允许注册一次
  if (globalState.get('ipcInited')) {
    return
  }
  globalState.set('ipcInited', true)
  powerMonitor.on('resume', () => {
    // 电源恢复是 app 级事件：广播给所有存活 workspace 窗口
    for (const win of easysshWindows.getAllAliveWindows()) {
      win.webContents.send('power-resume', null)
    }
  })
  // 从 IPC event 解析发起调用的窗口（多窗口 scope：§十五）
  function winFromEvent (event) {
    try {
      const win = event && event.sender && BrowserWindow.fromWebContents(event.sender)
      return win && !win.isDestroyed() ? win : globalState.get('win')
    } catch (err) {
      return globalState.get('win')
    }
  }
  async function init (event) {
    const {
      langs,
      langMap
    } = await loadLocales()
    const config = globalState.get('config')
    const win = winFromEvent(event)
    const globs = {
      config,
      langs,
      langMap,
      installSrc,
      appPath,
      exePath,
      isPortable,
      // EasySSH 多窗口：本窗口创建时绑定的启动 profile（Welcome 窗口为 null）
      easysshStartupProfileId: easysshWindows.getStartupProfileId(
        win && win.webContents ? win.webContents.id : null
      )
    }
    initApp(langMap, config)
    // 全局快捷键只注册一次（多窗口不再重复注册）
    if (!globalState.get('shortcutsInited')) {
      initShortCut(globalShortcut, win, config)
      globalState.set('shortcutsInited', true)
    }
    return globs
  }

  ipcMain.on('sync-func', (event, { name, args }) => {
    event.returnValue = ipcSyncFuncs[name](...args)
  })
  const asyncGlobals = {
    confirmExit: () => {
      globalState.set('confirmExit', true)
    },
    setPassword,
    checkPassword,
    lookup,
    loadSshConfig,
    init,
    listSerialPorts,
    loadFontList,
    doUpgrade,
    checkDbUpgrade,
    checkMigrate,
    migrate,
    getExitStatus: () => globalState.get('exitStatus'),
    setExitStatus: (status) => {
      globalState.set('exitStatus', status)
    },
    encryptAsync,
    decryptAsync,
    safeEncrypt: (str) => safeEncrypt(str),
    safeDecrypt: (str) => safeDecrypt(str),
    dbAction,
    getScreenSize,
    closeApp: (eventOrAction, closeAction = '') => {
      // 多窗口：渲染端 runGlobalAsync 调用时首参是 event；内部调用时首参是 closeAction
      const isEvent = eventOrAction && eventOrAction.sender
      const win = isEvent ? winFromEvent(eventOrAction) : globalState.get('win')
      globalState.set('closeAction', isEvent ? closeAction : eventOrAction)
      win && win.close()
    },
    exit: (event) => {
      const win = winFromEvent(event)
      win && win.close()
    },
    restart: (eventOrAction, closeAction = '') => {
      const isEvent = eventOrAction && eventOrAction.sender
      const win = isEvent ? winFromEvent(eventOrAction) : globalState.get('win')
      globalState.set('closeAction', '')
      win && win.close()
      app.relaunch()
    },
    setCloseAction: (closeAction = '') => {
      globalState.set('closeAction', closeAction)
    },
    minimize: (event) => {
      const win = winFromEvent(event)
      win && win.minimize()
    },
    listItermThemes,
    maximize,
    unmaximize,
    openDevTools: (event) => {
      const win = winFromEvent(event)
      win && win.webContents.openDevTools()
    },
    // EasySSH 多窗口（Phase 4A-P0）：
    // 连接启动器 —— 已连接窗口选择其它 profile 时打开/聚焦独立 BrowserWindow
    easysshOpenProfileWindow: async (profileId) => {
      return easysshWindows.openProfileWindow(profileId)
    },
    // 窗口连接某个 profile 后回写绑定，后续选择同一 profile 时 focus 本窗口
    easysshBindProfileWindow: (event, profileId) => {
      const win = winFromEvent(event)
      easysshWindows.bindProfile(win, profileId)
      return true
    },
    setWindowSize: (update) => {
      lastStateManager.set('windowSize', update)
    },
    saveUserConfig,
    AIchat,
    AIchatWithTools,
    getStreamContent,
    stopStream,
    setTitle: (title) => {
      const win = globalState.get('win')
      win && win.setTitle((packInfo.productName || packInfo.name) + ' - ' + title)
    },
    setBackgroundColor: (color = '#33333300') => {
      const win = globalState.get('win')
      win && win.setBackgroundColor(color)
    },
    changeHotkey: changeHotkeyReg(globalShortcut, globalState.get('win')),
    initCommandLine,
    watchFile,
    unwatchFile,
    openFileWithEditor,
    listWidgets,
    runWidget,
    stopWidget,
    runWidgetFunc,
    registerDeepLink,
    unregisterDeepLink,
    checkProtocolRegistration,
    getPendingDeepLink,
    getEnv: (key) => {
      if (key) {
        return SAFE_ENV_KEYS.includes(key) ? process.env[key] : ''
      }
      return Object.fromEntries(
        SAFE_ENV_KEYS
          .filter(k => process.env[k] !== undefined)
          .map(k => [k, process.env[k]])
      )
    }
  }
  // 窗口 scoped 的 asyncGlobal：dispatch 时把 IPC event 作为首参传入
  const windowScopedGlobals = new Set([
    'init',
    'closeApp',
    'exit',
    'restart',
    'minimize',
    'openDevTools',
    'easysshBindProfileWindow'
  ])
  ipcMain.handle('async', (event, { name, args }) => {
    if (windowScopedGlobals.has(name)) {
      return asyncGlobals[name](event, ...(args || []))
    }
    return asyncGlobals[name](...(args || []))
  })
  ipcMain.handle('show-open-dialog-sync', async (event, ...args) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return dialog.showOpenDialogSync(win, ...args)
  })
  ipcMain.handle('show-save-dialog', async (event, ...args) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return dialog.showSaveDialog(win, ...args)
  })
}

exports.initIpc = initIpc
exports.initAppServer = initAppServer
