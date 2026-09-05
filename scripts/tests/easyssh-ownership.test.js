/**
 * Phase 4A-P0-SOURCE-AUDIT 最小单测：
 * 1. Settings 通知链（setSettingItem 必须触发 easyssh:setting-modal）
 * 2. SFTP ownership（dropSftp 不 destroy 借用实例；destroyed 不可再借出）
 * 3. username home 兜底
 * 说明：easyssh-sftp/ws 依赖 window（worker），源码级断言 + 纯函数单测结合。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8')

const { getUsernameHome, getOwnerTab } = await import('../../src/client/common/easyssh-utils.js')

test('username home fallback: root → /root, others → /home/<user>, empty → empty', () => {
  assert.equal(getUsernameHome('root'), '/root')
  assert.equal(getUsernameHome('demo'), '/home/demo')
  assert.equal(getUsernameHome(''), '')
  assert.equal(getUsernameHome(undefined), '')
})

test('settings: setSettingItem dispatches easyssh:setting-modal (reactivity bridge)', () => {
  const src = read('../../src/client/store/common.js')
  const m = src.match(/setSettingItem = function \(v\) \{([\s\S]*?)\n  \}/)
  assert.ok(m, 'setSettingItem found')
  assert.match(m[1], /dispatchEvent\(new Event\('easyssh:setting-modal'\)\)/, 'must dispatch notification')
})

test('settings: hideSettingModal does not double-dispatch', () => {
  const src = read('../../src/client/store/setting.js')
  const m = src.match(/hideSettingModal = function \(\) \{([\s\S]*?)\n  \}/)
  assert.ok(m, 'hideSettingModal found')
  const dispatches = (m[1].match(/dispatchEvent/g) || []).length
  assert.equal(dispatches, 0, 'hide relies on setSettingItem notification; no extra dispatch')
})

test('sftp ownership: dropSftp only destroys easyssh-owned instances', () => {
  const src = read('../../src/client/common/easyssh-sftp.js')
  const m = src.match(/export function dropSftp \(tabId\) \{([\s\S]*?)\n\}/)
  assert.ok(m, 'dropSftp found')
  assert.match(m[1], /owner === 'easyssh'/, 'destroy must be gated by ownership')
  assert.match(src, /owner: 'entry'/, 'borrowed instances must be recorded as owner=entry')
  assert.match(src, /destroyed/, 'dead-state must be checked before lending')
})

test('sftp: Sftp.destroy sets destroyed flag and clears ws', () => {
  const src = read('../../src/client/common/sftp.js')
  const m = src.match(/async destroy \(\) \{([\s\S]*?)\n  \}/)
  assert.ok(m, 'destroy found')
  assert.match(m[1], /this\.destroyed = true/)
  assert.match(m[1], /this\.ws = null/)
})

test('getOwnerTab prefers non-error tab (regression)', () => {
  const tabs = [
    { id: 't1', srcId: 'a', pane: 'ssh', status: 'error' },
    { id: 't2', srcId: 'a', pane: 'ssh', status: 'done' }
  ]
  assert.equal(getOwnerTab({ tabs }, 'a').id, 't2')
})
