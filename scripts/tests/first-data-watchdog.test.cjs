const assert = require('assert')

let passed = 0
async function test (name, fn) {
  try {
    await fn()
    passed++
    console.log(`PASS ${name}`)
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`)
    process.exitCode = 1
  }
}

async function main () {
  const { armFirstDataWatchdog } = await import('../../src/client/common/first-data-watchdog.mjs')

  await test('real first data cancels timeout', () => {
    let callback
    let timeout
    let cleared = false
    let timedOut = false
    armFirstDataWatchdog({
      subscribe: cb => { callback = cb },
      onTimeout: () => { timedOut = true },
      setTimer: cb => { timeout = cb; return 7 },
      clearTimer: id => { cleared = id === 7 }
    })
    callback()
    timeout()
    assert.strictEqual(cleared, true)
    assert.strictEqual(timedOut, false)
  })

  await test('data received before subscription cancels timeout synchronously', () => {
    let timeout
    let cleared = false
    let timedOut = false
    armFirstDataWatchdog({
      subscribe: cb => cb(),
      onTimeout: () => { timedOut = true },
      setTimer: cb => { timeout = cb; return 9 },
      clearTimer: id => { cleared = id === 9 }
    })
    timeout()
    assert.strictEqual(cleared, true)
    assert.strictEqual(timedOut, false)
  })

  await test('no data fires timeout exactly once', () => {
    let timeout
    let count = 0
    armFirstDataWatchdog({
      subscribe: () => {},
      onTimeout: () => { count++ },
      setTimer: cb => { timeout = cb; return 11 },
      clearTimer: () => {}
    })
    timeout()
    timeout()
    assert.strictEqual(count, 1)
  })

  // Phase 4A-P0 §五十/§五十二：watchdog 首包后必须永久失效，
  // 绝不能在长运行会话（train.py / top / vim 数小时无 prompt）中误杀终端。
  await test('watchdog cannot fire again after first message (long-run invariant)', async () => {
    const { setTimeout: realSetTimeout } = require('timers')
    let subscribeCb = null
    let fired = 0
    armFirstDataWatchdog({
      subscribe: cb => { subscribeCb = cb },
      onTimeout: () => { fired++ },
      timeoutMs: 30
    })
    await new Promise(r => realSetTimeout(r, 5))
    // 首包到达（shell banner / 任意首条消息）
    subscribeCb()
    // 之后 2 倍超时窗口过去：不得触发
    await new Promise(r => realSetTimeout(r, 80))
    assert.strictEqual(fired, 0, 'watchdog must be permanently settled after first message')
  })

  console.log(`${passed}/4 ALL PASS`)
  if (passed !== 4) process.exitCode = 1
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
