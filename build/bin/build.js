/**
 * build
 */

const { exec, echo } = require('shelljs')

echo('start build')

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
