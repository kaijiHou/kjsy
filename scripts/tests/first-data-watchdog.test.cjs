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

  console.log(`${passed}/3 ALL PASS`)
  if (passed !== 3) process.exitCode = 1
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
