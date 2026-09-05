const assert = require('assert')
const fs = require('fs')
const path = require('path')

const { DEFAULT_EASYSSH_BOOKMARK_ID, DEFAULT_EASYSSH_BOOKMARK } = require('../../src/app/upgrade/default-easyssh-bookmark')
const defaults = require('../../src/app/upgrade/db-defaults')

let passed = 0

function test (name, fn) {
  fn()
  passed += 1
  console.log(`  PASS ${passed}. ${name}`)
}

test('default bookmark has the tutorial host, port and user', () => {
  assert.strictEqual(DEFAULT_EASYSSH_BOOKMARK_ID, 'easyssh-default-demo')
  assert.strictEqual(DEFAULT_EASYSSH_BOOKMARK.host, '203.0.113.10')
  assert.strictEqual(DEFAULT_EASYSSH_BOOKMARK.port, 2222)
  assert.strictEqual(DEFAULT_EASYSSH_BOOKMARK.username, 'demo')
})

test('default bookmark does not ship a password', () => {
  assert.ok(!Object.prototype.hasOwnProperty.call(DEFAULT_EASYSSH_BOOKMARK, 'password'))
})

test('default bookmark opens the demo container mount', () => {
  assert.strictEqual(DEFAULT_EASYSSH_BOOKMARK.easysshDefaultRemotePath, '/home/demo/llm')
})

test('new-user database defaults include the bookmark and group membership', () => {
  const bookmarkSeed = defaults.find(item => item.db === 'bookmarks')
  const groupSeed = defaults.find(item => item.db === 'bookmarkGroups')
  assert.strictEqual(bookmarkSeed.data[0]._id, DEFAULT_EASYSSH_BOOKMARK_ID)
  assert.ok(groupSeed.data[0].bookmarkIds.includes(DEFAULT_EASYSSH_BOOKMARK_ID))
})

test('existing-user migration is idempotent and matching-aware', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/app/upgrade/v5.0.9.js'), 'utf8')
  assert.match(source, /bookmark\._id === DEFAULT_EASYSSH_BOOKMARK_ID/)
  assert.match(source, /bookmark\.host === DEFAULT_EASYSSH_BOOKMARK\.host/)
  assert.match(source, /bookmark\.username === DEFAULT_EASYSSH_BOOKMARK\.username/)
  assert.match(source, /existing\?\._id \|\| DEFAULT_EASYSSH_BOOKMARK_ID/)
  assert.match(source, /updateDBVersion\(VERSION_TO\)/)
})

test('demo path migration preserves custom paths', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/app/upgrade/v5.0.10.js'), 'utf8')
  assert.match(source, /existing\.easysshDefaultRemotePath === LEGACY_PATH/)
  assert.match(source, /easysshDefaultRemotePath: DEFAULT_EASYSSH_BOOKMARK\.easysshDefaultRemotePath/)
  assert.match(source, /updateDBVersion\(VERSION_TO\)/)
})

console.log(`\n${passed}/6 tests passed`)
console.log('ALL PASS')
