/**
 * EasySSH SFTP 连接管理 —— 完全复用 electerm 的 sftp 客户端（common/sftp）
 * 连接建立是 Session 级共享状态：
 *   - 第一次需要时建立（优先复用 sftp-entry 已建连接，fallback 自建）
 *   - 建立成功后缓存（conns），后续 Explorer/Editor 直接复用，绝不重复等待
 *   - 并发请求共享同一个 ready promise（不重复触发建立）
 */
import Client from './sftp'
import getProxy from './get-proxy'
import { refs } from '../components/common/ref'

const conns = new Map() // tabId -> sftp 实例（已就绪）
const pending = new Map() // tabId -> Promise<sftp>（建立中）

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getTerminalPort (tabId) {
  const inst = refs.get('term-' + tabId)
  return inst && inst.port ? inst.port : null
}

function getSftpEntry (tabId) {
  const entry = refs.get('sftp-' + tabId)
  return entry && entry.sftp && entry.sftp.ws ? entry.sftp : null
}

/**
 * 获取已就绪的 SFTP 连接（同步判断，无副作用）
 */
export function getReadySftp (tabId) {
  const cached = conns.get(tabId)
  return cached && cached.ws ? cached : null
}

/**
 * 确保 SFTP 就绪（共享 ready promise）
 * force=true：忽略缓存强制重建（连接断开后的恢复路径）
 */
export async function ensureSftp (store, tab, force = false) {
  const cached = conns.get(tab.id)
  if (!force && cached && cached.ws) {
    return cached
  }
  if (force) {
    conns.delete(tab.id)
    pending.delete(tab.id)
  }
  if (!pending.has(tab.id)) {
    pending.set(tab.id, initSftp(store, tab))
  }
  return pending.get(tab.id)
}

async function initSftp (store, tab) {
  try {
    // 优先复用 sftp-entry 连接（terminal 连接成功后 initData 会触发 connect）
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const sftp = getSftpEntry(tab.id)
      if (sftp) {
        conns.set(tab.id, sftp)
        return sftp
      }
      await sleep(300)
    }
    // fallback：自建（复用 electerm 客户端，带 10s 保护）
    const port = getTerminalPort(tab.id)
    if (!port) {
      return null
    }
    const config = store.config
    // ws 通道建立有界（8s）：initWs 的 Promise 在 ws 打不开时永不 settle，
    // 不加超时会让 Explorer 永远停在 Loading（Phase 4A-P0-EXPLORER）
    const sftp = await Promise.race([
      Client(tab.id, 'sftp', port),
      new Promise((resolve, reject) => setTimeout(() => reject(new Error('sftp ws open timeout (8s)')), 8000))
    ])
    await Promise.race([
      sftp.connect({
        ...tab,
        terminalId: tab.id,
        readyTimeout: config.sshReadyTimeout,
        keepaliveInterval: config.keepaliveInterval,
        proxy: getProxy(tab, config)
      }),
      new Promise((resolve, reject) => setTimeout(() => reject(new Error('sftp connect timeout')), 10000))
    ])
    conns.set(tab.id, sftp)
    return sftp
  } finally {
    pending.delete(tab.id)
  }
}

export function dropSftp (tabId) {
  const s = conns.get(tabId)
  if (s) {
    try {
      s.destroy()
    } catch (e) {
      console.debug('dropSftp error', e)
    }
    conns.delete(tabId)
  }
}
