/**
 * EasySSH SFTP 连接管理 —— 完全复用 electerm 的 sftp 客户端（common/sftp）
 * 连接建立是 Session 级共享状态：
 *   - 第一次需要时建立（优先复用 sftp-entry 已建连接，fallback 自建）
 *   - 建立成功后缓存（conns），后续 Explorer/Editor 直接复用，绝不重复等待
 *   - 并发请求共享同一个 ready promise（不重复触发建立）
 *
 * Phase 4A-P0-SOURCE-AUDIT（ownership 语义）：
 *   conns: tabId -> { sftp, owner: 'entry' | 'easyssh' }
 *   - owner='entry'   借用 upstream SftpEntry 持有的连接，EasySSH 绝不 destroy
 *   - owner='easyssh' EasySSH 自建 client，生命周期由 EasySSH 管理
 *   - dropSftp 只 destroy 自己 owned 的实例；借用方只清缓存引用
 *   - destroyed 实例（Sftp.destroy 后）不会再被 getSftpEntry/ensureSftp 返回
 */
import Client from './sftp'
import getProxy from './get-proxy'
import { refs } from '../components/common/ref'

const conns = new Map() // tabId -> { sftp, owner }
const pending = new Map() // tabId -> { promise, generation }
let generationCounter = 0 // 单调递增：force/drop 期间旧代结果一律作废

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getTerminalPort (tabId) {
  const inst = refs.get('term-' + tabId)
  return inst && inst.port ? inst.port : null
}

function getSftpEntry (tabId) {
  const entry = refs.get('sftp-' + tabId)
  // destroyed 标记（Sftp.destroy 后置位）——不能只看 ws truthy，
  // 否则 destroy 后的死对象会被反复借出
  return entry && entry.sftp && entry.sftp.ws && !entry.sftp.destroyed
    ? entry.sftp
    : null
}

/**
 * 获取已就绪的 SFTP 连接（同步判断，无副作用）
 */
export function getReadySftp (tabId) {
  const cached = conns.get(tabId)
  return cached && cached.sftp && cached.sftp.ws && !cached.sftp.destroyed
    ? cached.sftp
    : null
}

function evictIfStale (tabId, generation) {
  const p = pending.get(tabId)
  if (p && p.generation === generation) {
    pending.delete(tabId)
  }
}

/**
 * 确保 SFTP 就绪（共享 ready promise）
 * force=true：丢弃缓存与借用实例（仅当其不健康/已失效）后重建 EasySSH-owned 连接
 */
export async function ensureSftp (store, tab, force = false) {
  const cached = conns.get(tab.id)
  if (!force && cached && cached.sftp && cached.sftp.ws && !cached.sftp.destroyed) {
    return cached.sftp
  }
  // 丢弃旧缓存（不 destroy 借用的 entry 实例）
  conns.delete(tab.id)
  if (force) {
    pending.delete(tab.id)
  }
  const generation = ++generationCounter
  if (!pending.has(tab.id)) {
    const promise = initSftp(store, tab, generation)
    pending.set(tab.id, { promise, generation })
  }
  const entry = pending.get(tab.id)
  try {
    const sftp = await entry.promise
    // generation guard：等待期间被 force/drop 作废的旧代结果不再返回
    if (entry.generation !== (pending.get(tab.id) || {}).generation && conns.get(tab.id)) {
      return conns.get(tab.id).sftp
    }
    return sftp
  } finally {
    evictIfStale(tab.id, entry.generation)
  }
}

async function initSftp (store, tab, generation) {
  try {
    // 优先复用 sftp-entry 连接（terminal 连接成功后 initData 会触发 connect）
    const deadline = Date.now() + 15000
    let waited = 0
    while (Date.now() < deadline) {
      const sftp = getSftpEntry(tab.id)
      if (sftp) {
        conns.set(tab.id, { sftp, owner: 'entry' })
        console.info('[EasySSH SFTP] borrowed sftp-entry client', {
          tabId: tab.id,
          waitedMs: waited
        })
        return sftp
      }
      waited += 300
      await sleep(300)
    }
    // fallback：自建 EasySSH-owned 连接（复用 electerm 客户端）
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
    // generation guard：等待期间被作废则不缓存/不返回旧代结果
    if (generation !== undefined && pending.get(tab.id) && pending.get(tab.id).generation !== generation) {
      try {
        sftp.destroy()
      } catch (e) {}
      return conns.get(tab.id) ? conns.get(tab.id).sftp : sftp
    }
    conns.set(tab.id, { sftp, owner: 'easyssh' })
    return sftp
  } finally {
    const p = pending.get(tab.id)
    if (p && p.generation === generation) {
      pending.delete(tab.id)
    }
  }
}

export function dropSftp (tabId) {
  const c = conns.get(tabId)
  if (c) {
    // 只 destroy EasySSH-owned 实例；borrowed（sftp-entry）的连接由其 owner 管理，
    // 这里 destroy 会把上游正在使用的 SFTP 打断（ownership bug）
    if (c.owner === 'easyssh') {
      try {
        c.sftp.destroy()
      } catch (e) {
        console.debug('dropSftp error', e)
      }
    }
    conns.delete(tabId)
  }
  // 同步作废进行中的建立（旧代结果由 generation guard 丢弃）
  pending.delete(tabId)
}
