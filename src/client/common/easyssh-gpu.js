/**
 * EasySSH GPU Status service (kjsy layer)
 *
 * 通过现有 SSH session 的 exec channel 执行只读 nvidia-smi 查询——
 * 复用 transport、不新建连接、不污染交互 Terminal、不修改服务器。
 *
 * 查询字段已在常见 Linux GPU 主机上实测支持：
 *   --query-gpu: index,name,utilization.gpu,memory.used,memory.total,
 *                temperature.gpu,power.draw,power.limit
 *   --query-compute-apps: pid,process_name,used_gpu_memory,gpu_uuid
 *   --query-gpu: index,uuid（进程→GPU 映射）
 */

import {
  parseCsv,
  toGpu,
  toProc,
  classifyGpu,
  parsePsUsers,
  extractPids
} from './gpu-parser.mjs'

export {
  parseCsv,
  toGpu,
  toProc,
  classifyGpu,
  parsePsUsers,
  processBasename,
  extractPids
} from './gpu-parser.mjs'

const GPU_QUERY_FIELDS = 'index,uuid,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit'
const PROC_QUERY_FIELDS = 'pid,process_name,used_gpu_memory,gpu_uuid'
const PS_USERS_CMD = 'ps -eo pid= -o user='
const EXEC_TIMEOUT_MS = 8000

/**
 * 批量查询 PID → USER（固定全量 ps 命令，客户端 map——零字符串拼接，安全）
 * 失败/PID 消失返回 null（不阻塞 GPU 数据）
 */
async function queryProcessUsers (wsFetch, tabId, pids) {
  if (!pids || !pids.length) {
    return {}
  }
  try {
    const res = await wsFetch({
      action: 'exec-cmd',
      pid: tabId,
      cmd: PS_USERS_CMD,
      timeoutMs: EXEC_TIMEOUT_MS
    })
    const stdout = typeof res === 'string' ? res : (res && res.stdout) || ''
    return parsePsUsers(stdout)
  } catch (e) {
    return {}
  }
}

/**
 * 查询 GPU 状态（复用现有 session exec channel）
 * @returns {Promise<{gpus: Array, processes: Array, available: boolean, error: string|null}>}
 */
export async function queryGpuStatus (wsFetch, tabId) {
  if (!wsFetch || !tabId) {
    return { gpus: [], processes: [], available: false, error: 'Server is not connected.' }
  }
  const cmd = `nvidia-smi --query-gpu=${GPU_QUERY_FIELDS} --format=csv,noheader,nounits`
  try {
    // GPU 与进程查询并行发出（进程失败不阻塞 GPU 列表）
    const [gpuRes, procRes] = await Promise.all([
      wsFetch({
        action: 'exec-cmd',
        pid: tabId,
        cmd,
        timeoutMs: EXEC_TIMEOUT_MS
      }),
      wsFetch({
        action: 'exec-cmd',
        pid: tabId,
        cmd: `nvidia-smi --query-compute-apps=${PROC_QUERY_FIELDS} --format=csv,noheader,nounits`,
        timeoutMs: EXEC_TIMEOUT_MS
      }).catch(() => null)
    ])
    const stdout = typeof gpuRes === 'string' ? gpuRes : (gpuRes && gpuRes.stdout) || ''
    const rows = parseCsv(stdout)
    if (!rows.length) {
      return { gpus: [], processes: [], available: false, error: 'NVIDIA GPU information is unavailable on this server.' }
    }
    const gpus = rows.map(toGpu)
    // uuid → index 映射（来自同一查询，不再单独发请求）
    const uuidToIndex = {}
    gpus.forEach(g => {
      if (g.uuid && g.index != null) uuidToIndex[g.uuid] = g.index
    })

    let processes = []
    if (procRes) {
      const procRows = parseCsv(typeof procRes === 'string' ? procRes : (procRes.stdout) || '')
      processes = procRows.map(r => toProc(r, uuidToIndex))
    }

    // 批量 user 查询（固定全量 ps——零拼接；失败/PID 消失 → user null，不阻塞）
    const pids = extractPids(processes)
    const userMap = pids.length ? await queryProcessUsers(wsFetch, tabId, pids) : {}
    processes.forEach(p => {
      p.user = (p.pid && userMap[p.pid]) || null
    })

    // Idle / In use 判定（明确规则见 gpu-parser.mjs）
    gpus.forEach(g => {
      g.status = classifyGpu(g, processes)
    })

    return { gpus, processes, available: true, error: null }
  } catch (e) {
    const msg = (e && e.message) || String(e)
    // 超时/断开——不暴露内部错误细节
    if (/timeout|timed out/i.test(msg)) {
      return { gpus: [], processes: [], available: false, error: 'GPU status request timed out.' }
    }
    return { gpus: [], processes: [], available: false, error: 'Server is not connected.' }
  }
}
