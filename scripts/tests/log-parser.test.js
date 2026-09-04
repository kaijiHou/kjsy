/**
 * Log parser 最小单元测试（Node assert——无依赖、不连服务器、独立可执行）
 *
 * 运行：node scripts/tests/log-parser.test.js
 * 覆盖：normal lines / split line / multi-line chunk / CRLF / UTF-8 跨 chunk /
 *       ANSI / CR(tqdm) / ring buffer 溢出 / clear / UTF-8 byte limit /
 *       空 chunk / binary 检测
 */

import assert from 'node:assert'
import {
  stripAnsi,
  LineSplitter,
  Utf8Decoder,
  RingBuffer,
  isBinary
} from '../../src/client/common/log-parser.mjs'

let passed = 0
const total = 12

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

// 1. 正常行
ok('1. normal lines', () => {
  const s = new LineSplitter()
  assert.deepStrictEqual(s.push('a\nb\nc\n'), ['a', 'b', 'c'])
  assert.deepStrictEqual(s.flush(), [])
})

// 2. 跨 chunk 拆行（partial line 拼接）
ok('2. split line across chunks', () => {
  const s = new LineSplitter()
  assert.deepStrictEqual(s.push('PART_A'), [])
  assert.deepStrictEqual(s.push('_PART_B\n'), ['PART_A_PART_B'])
  assert.deepStrictEqual(s.flush(), [])
})

// 3. 一个 chunk 多行
ok('3. multiple lines one chunk', () => {
  const s = new LineSplitter()
  assert.deepStrictEqual(s.push('l1\nl2\nl3\nl4\n'), ['l1', 'l2', 'l3', 'l4'])
})

// 4. CRLF 归一
ok('4. CRLF normalize', () => {
  const s = new LineSplitter()
  assert.deepStrictEqual(s.push('a\r\nb\r\n'), ['a', 'b'])
  // 行尾孤 \r 也去掉
  assert.deepStrictEqual(s.push('c\r'), [])
  assert.deepStrictEqual(s.flush(), ['c'])
})

// 5. UTF-8 中文跨 chunk（多字节安全）
ok('5. UTF-8 split boundary', () => {
  const d = new Utf8Decoder()
  const bytes = new TextEncoder().encode('训练开始：第1轮\n')
  const half = Math.floor(bytes.length / 2)
  const part1 = d.push(bytes.slice(0, half))
  const part2 = d.push(bytes.slice(half))
  const s = new LineSplitter()
  const lines = [...s.push(part1), ...s.push(part2), ...s.flush()]
  assert.strictEqual(lines[0], '训练开始：第1轮')
})

// 6. ANSI strip
ok('6. ANSI strip', () => {
  assert.strictEqual(stripAnsi('\u001b[31mERROR_TEST\u001b[0m'), 'ERROR_TEST')
  const s = new LineSplitter()
  assert.deepStrictEqual(s.push('\u001b[32mOK\u001b[0m\n'), ['OK'])
})

// 7. CR/tqdm 覆盖（取最后一段，不产生几千行）
ok('7. CR progress overwrite', () => {
  const s = new LineSplitter()
  // 同一行内多次 \r：只保留最后一段
  assert.deepStrictEqual(s.push('progress 10%\rprogress 20%\rprogress 100%\n'), ['progress 100%'])
})

// 8. ring buffer 上限（行数 + 字节）
ok('8. ring buffer truncation', () => {
  const rb = new RingBuffer(3, 1024)
  rb.push('a')
  rb.push('b')
  rb.push('c')
  rb.push('d')
  assert.deepStrictEqual(rb.lines, ['b', 'c', 'd'])
  const rb2 = new RingBuffer(100, 10)
  rb2.push('xxxxxxxxxx') // 10 bytes + 1 newline = 11 > 10（单条保留，防删空）
  rb2.push('y')
  assert.deepStrictEqual(rb2.lines, ['y']) // 第二条挤掉超限最旧行
  rb2.clear()
  assert.strictEqual(rb2.lines.length, 0)
})

// 9. Clear 同时丢弃 partial，避免清屏后旧半行复活
ok('9. splitter clear discards partial', () => {
  const s = new LineSplitter()
  assert.deepStrictEqual(s.push('OLD_PARTIAL'), [])
  s.clear()
  assert.deepStrictEqual(s.push('NEW\n'), ['NEW'])
})

// 10. 字节上限按 UTF-8 字节计算，不按 JS UTF-16 长度
ok('10. ring buffer UTF-8 byte limit', () => {
  const rb = new RingBuffer(100, 5)
  rb.push('中') // 3 bytes + newline
  rb.push('a') // pushes total over 5 bytes, evict the older line
  assert.deepStrictEqual(rb.lines, ['a'])
  assert.strictEqual(rb.bytes, 2)
})

// 11. 空 chunk / 无内容
ok('11. empty chunk', () => {
  const s = new LineSplitter()
  assert.deepStrictEqual(s.push(''), [])
  assert.deepStrictEqual(s.push(null), [])
  assert.deepStrictEqual(s.flush(), [])
})

// 12. binary NUL 检测
ok('12. binary NUL detection', () => {
  assert.strictEqual(isBinary(Buffer.from('hello world\n')), false)
  assert.strictEqual(isBinary(Buffer.from([104, 105, 0, 0, 0, 0, 0, 0, 0, 0])), true)
  assert.strictEqual(isBinary(Buffer.alloc(0)), false)
})

console.log(`\n${passed}/${total} tests passed`)
if (passed === total) {
  console.log('ALL PASS')
} else {
  process.exitCode = 1
  console.error('SOME FAILED')
}
