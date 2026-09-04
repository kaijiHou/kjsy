import assert from 'node:assert/strict'
import {
  buildListTasksCommand,
  buildStartTaskCommand,
  buildStopTaskCommand,
  cwdExpression,
  parseTaskRows,
  shellQuote
} from '../../src/client/common/task-parser.mjs'

let passed = 0
function test (name, fn) {
  try {
    fn()
    passed++
    console.log('  PASS ' + name)
  } catch (e) {
    console.error('  FAIL ' + name)
    throw e
  }
}

test('1. shell quote protects single quotes', () => {
  assert.equal(shellQuote("a'b"), "'a'\\''b'")
})

test('2. home cwd expands without expanding user command', () => {
  assert.equal(cwdExpression('~/work dir'), '"$HOME"/\'work dir\'')
})

test('3. start command contains isolated process group and metadata', () => {
  const cmd = buildStartTaskCommand({
    taskId: 'task-123-abc',
    command: "printf '%s\\n' hello; sleep 1",
    cwd: '/tmp/work dir',
    startedAt: 1700000000000
  })
  assert.match(cmd, /setsid sh -c/)
  assert.doesNotMatch(cmd, /&;/)
  assert.match(cmd, /task-123-abc/)
  assert.match(cmd, /base\.command/)
  assert.match(cmd, /base\.ended/)
})

test('4. invalid task id is rejected', () => {
  assert.throws(() => buildStartTaskCommand({ taskId: '../bad', command: 'true' }), /Invalid task id/)
})

test('5. list command validates process identity', () => {
  const cmd = buildListTasksCommand()
  assert.match(cmd, /ps -eo pid= -o pgid=/)
  assert.match(cmd, /\/proc\/\$proc\/cmdline/)
})

test('6. parse running and exited rows', () => {
  const b64 = value => Buffer.from(value).toString('base64')
  const rows = [
    ['task-2-b', '22', '1700000002', '', '', '1', b64('/tmp/b.log'), b64('/tmp'), b64('sleep 9')].join('\t'),
    ['task-1-a', '11', '1700000001', '1700000005', '7', '0', b64('/tmp/a.log'), b64('~/x'), b64('exit 7')].join('\t')
  ].join('\n')
  const parsed = parseTaskRows(rows)
  assert.equal(parsed[0].status, 'running')
  assert.equal(parsed[1].status, 'exited')
  assert.equal(parsed[1].exitCode, 7)
  assert.equal(parsed[1].command, 'exit 7')
})

test('7. malformed rows are ignored', () => {
  assert.deepEqual(parseTaskRows('garbage\n../bad\t2\t3\t4\t0\tx\ty\tz'), [])
})

test('8. stop validates pid and identity before group signal', () => {
  const cmd = buildStopTaskCommand('task-123-abc', 456, 'TERM')
  assert.match(cmd, /Task process identity no longer matches/)
  assert.match(cmd, /kill -TERM -- -456/)
  assert.match(cmd, /kill -0 -- -456/)
  assert.match(cmd, /pgid.*456/)
  assert.match(cmd, /RUNNING/)
  assert.throws(() => buildStopTaskCommand('task-123-abc', 1), /Invalid task pid/)
})

console.log(`\n${passed}/8 tests passed`)
console.log('ALL PASS')
