/**
 * build
 */

const { exec, echo } = require('shelljs')

echo('start build')

// Phase 4A-P0-BUILD-RUNTIME-IDENTITY：构建时注入 commit/time（vite define 消费）
const commit = String(exec('git rev-parse HEAD', { silent: true }) || '').trim() || 'unknown'
process.env.EASYSSH_BUILD_COMMIT = commit
process.env.EASYSSH_BUILD_TIME = new Date().toISOString()

const timeStart = +new Date()

function run (cmd) {
  const result = exec(cmd)
  if (result.code !== 0) {
    process.exit(result.code || 1)
  }
}

// echo('clean')
// exec('npm run clean')
echo('version file')
echo('js/css file')
run('npm run vite-build')
echo('copy file')
run('node ./build/bin/copy.js')
echo('html file')
run('node ./build/bin/pug.js')

const endTime = +new Date()
echo(`done build in ${(endTime - timeStart) / 1000} s`)
