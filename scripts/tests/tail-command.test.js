import assert from 'node:assert/strict'
import { buildTailCmd, shellQuotePath } from '../../src/client/common/tail-command.mjs'

let passed = 0
function test (name, fn) {
  try {
    fn()
    passed++
    console.log('  PASS ' + name)
  } catch (error) {
    console.error('  FAIL ' + name)
    throw error
  }
}

test('1. path is single-quote escaped', () => {
  assert.equal(shellQuotePath("/tmp/a'b.log"), "'/tmp/a'\\''b.log'")
})

test('2. tail has an SSH-stdin lifetime owner', () => {
  const cmd = buildTailCmd('/tmp/app.log', 25)
  assert.match(cmd, /^tail -n 25 -F -- '\/tmp\/app\.log' & easyssh_tail=\$!;/)
  assert.match(cmd, /trap .* EXIT HUP INT TERM/)
  assert.match(cmd, /while IFS= read -r easyssh_keepalive/)
  assert.match(cmd, /kill -TERM "\$easyssh_tail"/)
  assert.match(cmd, /wait "\$easyssh_tail"/)
})

test('3. invalid line count falls back safely', () => {
  assert.match(buildTailCmd('/tmp/app.log', -1), /^tail -n 200 /)
})

console.log(`\n${passed}/3 tests passed`)
console.log('ALL PASS')
