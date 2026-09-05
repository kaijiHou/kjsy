/**
 * EasySSH owner 解析单测（Phase 4A-P0 §三十一）
 * getOwnerTab 必须按 serverId 解析连接型 tab，优先未出错的 tab。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { getOwnerTab, getOwnerBookmark, getServerState } = await import('../../src/client/common/easyssh-utils.js')

const paneMap = { ssh: 'ssh', terminal: 'terminal', fileManager: 'fileManager' }

function fakeStore (tabs, bookmarks = []) {
  return { tabs, bookmarks }
}

test('getOwnerTab returns the connected tab of its own server', () => {
  const tabs = [
    { id: 't1', srcId: 'bm-a', pane: paneMap.ssh, status: 'done' },
    { id: 't2', srcId: 'bm-b', pane: paneMap.ssh, status: 'done' }
  ]
  const store = fakeStore(tabs)
  const owner = getOwnerTab(store, 'bm-a')
  assert.equal(owner.id, 't1')
})

test('getOwnerTab prefers non-error tab and never crosses servers', () => {
  const tabs = [
    { id: 't1', srcId: 'bm-a', pane: paneMap.ssh, status: 'error' },
    { id: 't2', srcId: 'bm-a', pane: paneMap.ssh, status: 'done' }
  ]
  const store = fakeStore(tabs)
  assert.equal(getOwnerTab(store, 'bm-a').id, 't2')
  assert.equal(getOwnerTab(store, 'bm-missing'), null)
  assert.equal(getOwnerTab(store, null), null)
})

test('getOwnerTab ignores non-connection panes', () => {
  const tabs = [
    { id: 't1', srcId: 'bm-a', pane: 'other-pane', status: 'done' }
  ]
  assert.equal(getOwnerTab(fakeStore(tabs), 'bm-a'), null)
})

test('getOwnerBookmark finds bookmark by id', () => {
  const bms = [{ id: 'bm-a', host: 'h1' }]
  assert.equal(getOwnerBookmark(fakeStore([], bms), 'bm-a').host, 'h1')
  assert.equal(getOwnerBookmark(fakeStore([], bms), 'x'), null)
})

test('getServerState states', () => {
  const done = [{ id: 't1', srcId: 'a', pane: paneMap.ssh, status: 'done' }]
  assert.equal(getServerState(fakeStore(done), { id: 'a' }).state, 'connected')
  const proc = [{ id: 't1', srcId: 'a', pane: paneMap.ssh, status: 'processing' }]
  assert.equal(getServerState(fakeStore(proc), { id: 'a' }).state, 'connecting')
  const err = [{ id: 't1', srcId: 'a', pane: paneMap.ssh, status: 'error' }]
  assert.equal(getServerState(fakeStore(err), { id: 'a' }).state, 'error')
  assert.equal(getServerState(fakeStore([]), { id: 'a' }).state, 'disconnected')
})
