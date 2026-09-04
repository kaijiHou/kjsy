/**
 * execStream cancellation regression tests.
 * Run: node scripts/tests/exec-stream-lifecycle.test.cjs
 */

const assert = require('node:assert')
const { EventEmitter } = require('node:events')
const { commonExtends } = require('../../src/app/server/session-common')

class Session {}
commonExtends(Session)

function fakeStream () {
  const stream = new EventEmitter()
  stream.stderr = new EventEmitter()
  stream.closeCount = 0
  stream.signalCount = 0
  stream.signals = []
  stream.signal = (name) => {
    stream.signalCount++
    stream.signals.push(name)
  }
  stream.close = () => {
    stream.closeCount++
  }
  return stream
}

let passed = 0
const total = 3

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

ok('1. cancel before async exec callback closes late channel', () => {
  let callback
  let started = false
  const session = new Session()
  session.initOptions = {}
  session.client = {
    exec: (_cmd, _opts, cb) => { callback = cb }
  }
  const ctrl = session.execStream('tail -F test.log', {
    onStart: () => { started = true }
  })
  ctrl.cancel()
  const stream = fakeStream()
  callback(null, stream)
  assert.strictEqual(stream.closeCount, 1)
  assert.deepStrictEqual(stream.signals, ['TERM'])
  assert.strictEqual(started, false)
})

ok('2. cancel after channel open closes only that channel', () => {
  const stream = fakeStream()
  const session = new Session()
  session.initOptions = {}
  session.client = {
    exec: (_cmd, _opts, cb) => cb(null, stream)
  }
  const ctrl = session.execStream('tail -F test.log')
  ctrl.cancel()
  assert.strictEqual(stream.closeCount, 1)
  assert.deepStrictEqual(stream.signals, ['TERM'])
})

ok('3. repeated cancel sends TERM and closes only once', () => {
  const stream = fakeStream()
  const session = new Session()
  session.initOptions = {}
  session.client = {
    exec: (_cmd, _opts, cb) => cb(null, stream)
  }
  const ctrl = session.execStream('tail -F test.log')
  ctrl.cancel()
  ctrl.cancel()
  assert.strictEqual(stream.signalCount, 1)
  assert.strictEqual(stream.closeCount, 1)
})

console.log(`\n${passed}/${total} tests passed`)
if (passed === total) {
  console.log('ALL PASS')
} else {
  process.exitCode = 1
  console.error('SOME FAILED')
}
