/**
 * on close app
 * Phase 4A-P0 多窗口语义：
 *   - 还有其它窗口存活 → 只关闭本窗口工作区（公共 server 子进程保留）
 *   - 最后一个窗口关闭 → 原有完整退出流程（确认退出 / 杀 server / app.quit）
 */

const { dbAction } = require('./db')
const globalState = require('./glob-state')
const easysshWindows = require('./easyssh-windows')

exports.getExitStatus = async () => {
  const res = await dbAction('data', 'findOne', {
    _id: 'exitStatus'
  })
  return res && res.value ? res.value : ''
}

exports.onClose = async function (e, win) {
  const target = win || globalState.get('win')
  // 多窗口：非最后一个窗口只做窗口级关闭，不触发应用退出
  if (target && !easysshWindows.isLastWindow(target)) {
    easysshWindows.unregisterWindow(target)
    return // 不 preventDefault：窗口正常关闭，'closed' 事件再兜底清理
  }
  const config = globalState.get('config')
  if (config.confirmBeforeExit && globalState.get('closeAction')) {
    target?.webContents.send(
      'confirm-exit',
      globalState.get('closeAction')
    )
    globalState.set('closeAction', '')
    return e.preventDefault()
  }
  const log = require('../common/log')
  log.debug('Closing app')
  const childPid = globalState.get('childPid')
  childPid && process.kill(childPid)
  globalState.set('serverInited', false)
  process.on('uncaughtException', function () {
    const childPid = globalState.get('childPid')
    childPid && process.kill(childPid)
    process.exit(0)
  })
  log.debug('Child process killed')
  // await dbAction('data', 'update', {
  //   _id: 'exitStatus'
  // }, {
  //   value: 'ok',
  //   _id: 'exitStatus'
  // }, {
  //   upsert: true
  // })
  // await dbAction('data', 'update', {
  //   _id: 'sessions'
  // }, {
  //   value: null,
  //   _id: 'sessions'
  // }, {
  //   upsert: true
  // })
  // log.debug('session saved')
  clearTimeout(globalState.get('timer'))
  globalState.set('win', null)
  const app = globalState.get('app')
  app.quit && app.quit()
}
