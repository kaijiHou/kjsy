/**
 * GPU parser 最小单元测试（Node assert——无依赖、不连服务器、独立可执行）
 *
 * 运行：node scripts/tests/gpu-parser.test.js
 * 覆盖：正常 4 GPU / N/A / 无 Processes / PID 消失 / malformed / idle 规则 / ps user / basename / pid 提取
 */

import assert from 'node:assert'
import {
  parseCsv,
  toGpu,
  toProc,
  classifyGpu,
  parsePsUsers,
  processBasename,
  extractPids
} from '../../src/client/common/gpu-parser.mjs'

let passed = 0
const total = 10

function ok (name, fn) {
  try {
    fn()
    passed++
    console.log('  PASS', name)
  } catch (e) {
    console.error('  FAIL', name, '—', e.message)
    process.exitCode = 1
  }
}

// 1. 正常 4 GPU CSV（真实 GPU-75 脱敏样例）
ok('parseCsv: 正常 4 GPU', () => {
  const csv = [
    '0, GPU-0b3f0fad-5f13-3128-577c-4bae49f99ed6, NVIDIA GeForce RTX 3090, 0, 2, 24576, 23, 18.72, 350.00',
    '1, GPU-365b08d4-148b-0201-461e-506815083ad0, NVIDIA GeForce RTX 3090, 0, 0, 24576, 23, 27.56, 350.00',
    '2, GPU-affa5469-6245-d4e8-7642-8ed2f720c8ac, NVIDIA GeForce RTX 3090, 0, 0, 24576, 22, 22.94, 350.00',
    '3, GPU-6184dc76-25cb-ae92-c2cf-ec3ce0a7e5f7, NVIDIA GeForce RTX 3090, 0, 2, 24576, 22, 29.73, 350.00'
  ].join('\n')
  const rows = parseCsv(csv)
  assert.strictEqual(rows.length, 4)
  assert.strictEqual(rows[0].length, 9)
  assert.strictEqual(rows[0][2], 'NVIDIA GeForce RTX 3090')
})

// 2. toGpu: 字段映射 + 数字转换 + name trim
ok('toGpu: 映射与数字', () => {
  const g = toGpu(['2', 'GPU-x', ' NVIDIA GeForce RTX 3090', '0', '0', '24576', '22', '22.94', '350.00'])
  assert.strictEqual(g.index, '2')
  assert.strictEqual(g.name, 'NVIDIA GeForce RTX 3090')
  assert.strictEqual(g.memoryUsed, 0)
  assert.strictEqual(g.memoryTotal, 24576)
  assert.strictEqual(g.temperature, 22)
  assert.strictEqual(g.powerDraw, 22.94)
  assert.strictEqual(g.powerLimit, 350)
})

// 3. N/A 字段 → null（不 crash）
ok('toGpu: N/A → null', () => {
  const g = toGpu(['0', 'GPU-x', 'RTX', '[N/A]', '[N/A]', '24576', 'N/A', 'N/A', '350.00'])
  assert.strictEqual(g.utilization, null)
  assert.strictEqual(g.memoryUsed, null)
  assert.strictEqual(g.temperature, null)
  assert.strictEqual(g.powerDraw, null)
})

// 4. toProc + uuid → index 映射
ok('toProc: uuid 映射', () => {
  const map = { 'GPU-x': '1' }
  const p = toProc(['12345', '/home/user/anaconda3/envs/x/bin/python', '12000', 'GPU-x'], map)
  assert.strictEqual(p.pid, '12345')
  assert.strictEqual(p.gpuIndex, '1')
  assert.strictEqual(p.memoryUsed, 12000)
})

// 5. 无 Processes（空输出）→ 空数组
ok('parseCsv: 空输出', () => {
  assert.deepStrictEqual(parseCsv(''), [])
  assert.deepStrictEqual(parseCsv(null), [])
})

// 6. Malformed 行（垃圾字符）→ 行被跳过/不 crash
ok('parseCsv: malformed 容忍', () => {
  const rows = parseCsv('garbage!!!\n0, GPU-x, RTX, 0\n\n')
  assert.strictEqual(rows.length, 2)
})

// 7. Idle 规则：无进程 + 低显存 + 低 util → idle；有进程 → in-use；显存高 → in-use
ok('classifyGpu: idle/in-use 规则', () => {
  const gpu0 = { index: '0', memoryUsed: 2, utilization: 0 }
  const gpu1 = { index: '1', memoryUsed: 18432, utilization: 92 }
  const procs = [{ gpuIndex: '1', pid: '123' }]
  assert.strictEqual(classifyGpu(gpu0, []), 'idle')
  assert.strictEqual(classifyGpu(gpu1, procs), 'in-use')
  assert.strictEqual(classifyGpu(gpu0, procs), 'idle') // 无 gpu0 的进程
  // 无进程但显存高 → in-use（不误判）
  assert.strictEqual(classifyGpu({ index: '2', memoryUsed: 8000, utilization: 0 }, []), 'in-use')
  // util 缺失（N/A）但低显存无进程 → idle（不误判 busy）
  assert.strictEqual(classifyGpu({ index: '3', memoryUsed: 2, utilization: null }, []), 'idle')
})

// 8. ps user 解析（真实 ps -eo pid= -o user= 格式）
ok('parsePsUsers: 批量解析', () => {
  const out = '    1 root\n    2 root\n  123 alice\n  456 bob\n'
  const map = parsePsUsers(out)
  assert.strictEqual(map['1'], 'root')
  assert.strictEqual(map['123'], 'alice')
  assert.strictEqual(map['456'], 'bob')
  // PID 消失（ps 不再返回）→ map 无该 pid（上层显示 —，不 crash）
  assert.strictEqual(map['999'], undefined)
})

// 9. processBasename: 完整路径 → basename
ok('processBasename', () => {
  assert.strictEqual(processBasename('/home/user/anaconda3/envs/x/bin/python'), 'python')
  assert.strictEqual(processBasename('python'), 'python')
  assert.strictEqual(processBasename(''), 'unknown')
})

// 10. extractPids: 数字校验 + 去重 + 过滤
ok('extractPids: 安全提取', () => {
  const pids = extractPids([
    { pid: '123' },
    { pid: '123' },
    { pid: '0' },
    { pid: 'abc' },
    { pid: null },
    { pid: '456' }
  ])
  assert.deepStrictEqual(pids, ['123', '456'])
})

console.log(`\n${passed}/${total} tests passed`)
if (passed === total) {
  console.log('ALL PASS')
} else {
  process.exitCode = 1
  console.error('SOME FAILED')
}
