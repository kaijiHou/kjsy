import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const ssh = read('../../src/client/components/bookmark-form/config/ssh.js')
const form = read('../../src/client/components/bookmark-form/form-renderer.jsx')
const index = read('../../src/client/components/bookmark-form/index.jsx')
const setting = read('../../src/client/components/setting-panel/setting-modal.jsx')

const tests = [
  ['new SSH form has required-field guidance', () => {
    assert.match(ssh, /先填写带 \* 的必填项/)
    assert.match(ssh, /SSH 端口默认是 22/)
  }],
  ['new SSH form marks username required', () => {
    assert.match(ssh, /required: true, message: '请输入 SSH 用户名'/)
  }],
  ['new SSH form keeps optional title explicit', () => {
    assert.match(ssh, /连接名称（可选）/)
  }],
  ['advanced settings are collapsed', () => {
    assert.match(ssh, /type: 'collapse'/)
    assert.match(ssh, /label: '高级选项'/)
  }],
  ['simple buttons only apply to new bookmarks', () => {
    assert.match(form, /simpleWhenNew && props\.formData\?\.id\?\.startsWith\(newBookmarkIdPrefix\)/)
  }],
  ['new connection protocol list is SSH only', () => {
    assert.match(index, /k === connectionMap\.ssh && features\.ssh/)
  }],
  ['AI button follows disabled product feature', () => {
    assert.match(index, /!features\.ai/)
  }],
  ['new connection gets a focused layout', () => {
    assert.match(setting, /isNewConnection/)
  }]
]

let passed = 0
for (const [name, test] of tests) {
  test()
  passed++
  console.log(`  PASS ${passed}. ${name}`)
}
console.log(`\n${passed}/${tests.length} tests passed`)
console.log('ALL PASS')
