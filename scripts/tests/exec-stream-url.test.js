/**
 * exec-stream URL 构造回归测试（Phase 3C-P0 Bug1 的 token 防护）
 * 运行：node scripts/tests/exec-stream-url.test.js
 */
import assert from 'node:assert'
import { buildExecStreamUrl } from '../../src/client/common/exec-stream-url.mjs'

let passed = 0
const total = 4

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

ok('1. URL 包含 ?token=', () => {
  const u = buildExecStreamUrl(30976, 'tab-1', 'secret123', '127.0.0.1')
  assert.ok(u.includes('?token=secret123'), u)
  assert.ok(u.startsWith('ws://127.0.0.1:30976/exec/tab-1'), u)
})

ok('2. token 被 URL encode（特殊字符安全）', () => {
  const u = buildExecStreamUrl(30976, 'tab-1', 'a b&c=1/2', '127.0.0.1')
  assert.ok(u.includes('token=a%20b%26c%3D1%2F2'), u)
  assert.ok(!u.includes(' '), u)
})

ok('3. pid 缺省回落 0', () => {
  const u = buildExecStreamUrl(30976, null, 'tok', '127.0.0.1')
  assert.ok(u.includes('/exec/0?token='), u)
})

ok('4. host 缺省回落 127.0.0.1', () => {
  const u = buildExecStreamUrl(30976, 'tab-1', 'tok')
  assert.ok(u.startsWith('ws://127.0.0.1:'), u)
})

console.log(`\n${passed}/${total} tests passed`)
if (passed === total) {
  console.log('ALL PASS')
} else {
  process.exitCode = 1
  console.error('SOME FAILED')
}
