const assert = require('assert')
const { EventEmitter } = require('events')
const fs = require('fs')
const path = require('path')
const { readRemoteFile } = require('../../src/app/server/sftp-file')

let passed = 0
function test (name, fn) {
  return Promise.resolve().then(fn).then(() => {
    passed++
    console.log('  PASS ' + name)
  })
}

async function main () {
  const { joinRemotePath } = await import('../../src/client/common/easyssh-path.mjs')

  await test('1. nested Explorer paths retain every parent directory', () => {
    const camp = joinRemotePath('/public/home/demo-user', 'CAMP')
    assert.equal(joinRemotePath(camp, 'train_sues200.py'), '/public/home/demo-user/CAMP/train_sues200.py')
  })

  await test('2. root path does not gain duplicate slashes', () => {
    assert.equal(joinRemotePath('/', '/README.md'), '/README.md')
  })

  await test('3. remote readable errors reject instead of crashing the process', async () => {
    const expected = new Error('No such file')
    const stream = new EventEmitter()
    stream.pipe = () => stream
    const promise = readRemoteFile({ createReadStream: () => stream }, '/missing')
    process.nextTick(() => stream.emit('error', expected))
    await assert.rejects(promise, /No such file/)
  })

  await test('4. root map does not pass the array index as parent path', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/client/components/easyssh/explorer.jsx'), 'utf8')
    assert.match(source, /items\.filter\(isVisible\)\.map\(item => renderItem\(item\)\)/)
  })

  console.log(`\n${passed}/4 tests passed`)
  console.log('ALL PASS')
}

main().catch(error => {
  console.error(error.stack || error)
  process.exit(1)
})
