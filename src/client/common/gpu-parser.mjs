/**
 * EasySSH GPU parser — 纯函数（无依赖，可独立单元测试）
 *
 * Idle / In use 判定规则（明确、第一版、基于实机验证）：
 *   In use   : 存在 compute process
 *   In use   : 无 process 但显存占用 >= 50 MiB 或利用率 >= 1%（显存/利用率活动）
 *   Idle     : 无 process 且显存 < 50 MiB 且利用率 < 1%（驱动基础占用不算 busy）
 * 保守原则：数据缺失（N/A）时不误判 Busy——无 process + 低显存即 Idle。
 */

/** 安全 CSV 解析：按行、按逗号切分、逐字段 trim；空行忽略 */
export function parseCsv (text) {
  if (!text || typeof text !== 'string') {
    return []
  }
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.length) {
    return []
  }
  return lines.map(line => line.split(',').map(s => s.trim()))
}

function num (v) {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** GPU 行（index,uuid,name,util,memUsed,memTotal,temp,powerDraw,powerLimit）→ normalized object */
export function toGpu (row) {
  const [index, uuid, name, util, memUsed, memTotal, temp, powerDraw, powerLimit] = row
  return {
    index: index === undefined ? null : String(index),
    uuid: uuid || null,
    name: (name || 'Unknown GPU').trim(),
    utilization: num(util),
    memoryUsed: num(memUsed),
    memoryTotal: num(memTotal),
    temperature: num(temp),
    powerDraw: num(powerDraw),
    powerLimit: num(powerLimit)
  }
}

/** 进程行（pid,process_name,used_gpu_memory,gpu_uuid）→ normalized object（uuid 映射到 index） */
export function toProc (row, uuidToIndex) {
  const [pid, processName, usedGpuMemory, gpuUuid] = row
  return {
    pid: pid === undefined ? null : String(pid),
    processName: processName || 'unknown',
    memoryUsed: num(usedGpuMemory),
    gpuIndex: gpuUuid ? (uuidToIndex[gpuUuid] ?? null) : null
  }
}

/**
 * Idle / In use 判定（明确规则，见文件头注释）
 * @param {object} gpu normalized GPU object
 * @param {Array} procs 该 GPU 上的 compute processes
 */
export function classifyGpu (gpu, procs = []) {
  const hasProc = procs.some(p => p.gpuIndex === gpu.index)
  if (hasProc) {
    return 'in-use'
  }
  const memActive = gpu.memoryUsed != null && gpu.memoryUsed >= 50
  const utilActive = gpu.utilization != null && gpu.utilization >= 1
  if (memActive || utilActive) {
    return 'in-use'
  }
  return 'idle'
}

/**
 * 解析 `ps -eo pid= -o user=` 输出 → { pid: user } map
 * 格式：每行 "  PID USER"（空格分隔，无表头）
 */
export function parsePsUsers (text) {
  const map = {}
  if (!text || typeof text !== 'string') {
    return map
  }
  text.split(/\r?\n/).forEach(line => {
    const m = line.trim().match(/^(\d+)\s+(\S+)/)
    if (m) {
      map[m[1]] = m[2]
    }
  })
  return map
}

/** 进程名显示：basename（title 可展示完整路径） */
export function processBasename (name) {
  if (!name) return 'unknown'
  const parts = name.split('/')
  return parts[parts.length - 1] || name
}

/** 从进程列表提取合法 PID（纯数字、去重、过滤 0）——用于构造安全查询参数 */
export function extractPids (procs) {
  const seen = new Set()
  procs.forEach(p => {
    if (p && p.pid && /^\d+$/.test(p.pid) && p.pid !== '0') {
      seen.add(p.pid)
    }
  })
  return [...seen]
}
