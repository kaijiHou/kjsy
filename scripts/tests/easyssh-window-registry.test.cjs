/**
 * EasySSH multi-window registry 单测（Phase 4A-P0）
 * 覆盖：注册/注销/绑定、focus 判定、最后窗口判定、关闭清理语义。
 * 纯 node 运行（easyssh-windows.js 对 electron 无顶层依赖）。
 */
const { test } = require('node:test')
const assert = require('node:assert')

const {
  registerWindow,
  unregisterWindow,
  bindProfile,
  countAliveWindows,
  countOtherAliveWindows,
  findWindowByProfile,
  getAllAliveWindows,
  getStartupProfileId,
  onWindowClosing,
  isLastWindow,
  _registry
} = require('../../src/app/lib/easyssh-windows')

function fakeWin (id) {
  return {
    id: 'wc-' + id,
    webContents: { id },
    isDestroyed: () => false,
    isMinimized: () => false,
    show: () => {},
    focus: () => {}
  }
}

test('register + bind profile', () => {
  _registry.clear()
  const win = fakeWin(1)
  registerWindow(win, null)
  assert.strictEqual(countAliveWindows(), 1)
  assert.strictEqual(getStartupProfileId(1), null)
  bindProfile(win, 'bm-a')
  assert.strictEqual(getStartupProfileId(1), 'bm-a')
})

test('findWindowByProfile returns bound window', () => {
  _registry.clear()
  const w1 = fakeWin(1)
  const w2 = fakeWin(2)
  registerWindow(w1, null)
  registerWindow(w2, 'bm-b')
  assert.strictEqual(findWindowByProfile('bm-b'), w2)
  assert.strictEqual(findWindowByProfile('bm-a'), null)
  bindProfile(w1, 'bm-a')
  assert.strictEqual(findWindowByProfile('bm-a'), w1)
})

test('last window semantics', () => {
  _registry.clear()
  const w1 = fakeWin(1)
  const w2 = fakeWin(2)
  registerWindow(w1, 'bm-a')
  registerWindow(w2, 'bm-b')
  assert.strictEqual(countAliveWindows(), 2)
  assert.ok(!isLastWindow(w1))
  assert.strictEqual(countOtherAliveWindows(w1), 1)
  // 关闭 w1：还有 w2 存活 → 非最后窗口，仅注销
  assert.strictEqual(onWindowClosing(w1), false)
  assert.strictEqual(countAliveWindows(), 1)
  assert.ok(isLastWindow(w2))
  // 关闭 w2：最后一个 → 调用方执行完整退出
  assert.strictEqual(onWindowClosing(w2), true)
  assert.strictEqual(countAliveWindows(), 0)
})

test('unregister is idempotent and destroyed windows are ignored', () => {
  _registry.clear()
  const win = fakeWin(1)
  registerWindow(win, 'bm-a')
  unregisterWindow(win)
  unregisterWindow(win)
  assert.strictEqual(countAliveWindows(), 0)
  const dead = {
    webContents: { id: 9 },
    isDestroyed: () => true
  }
  registerWindow(dead, 'bm-x')
  assert.strictEqual(getAllAliveWindows().length, 0)
})
