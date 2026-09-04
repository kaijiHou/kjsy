const { resolve } = require('path')
const fs = require('fs')
const { cp, mkdir } = require('shelljs')
const brandedIcons = [
  ['easyssh-round-128x128.png', 'easyssh-round-128x128.png'],
  ['easyssh-tray-32x32.png', 'easyssh-tray.png']
]
const from0 = resolve(
  __dirname,
  '../../node_modules/electerm-icons/icons'
)
const to1 = resolve(
  __dirname,
  '../../work/app/assets/images/'
)
const to2 = resolve(
  __dirname,
  '../../work/app/assets/icons'
)
mkdir('-p', to1, to2)
for (const [sourceName, targetName] of brandedIcons) {
  const source = resolve(__dirname, '../../build/icons', sourceName)
  const target = resolve(to1, targetName)
  if (!fs.existsSync(source)) {
    throw new Error('Missing EasySSH icon: ' + source)
  }
  fs.copyFileSync(source, target)
}

if (!fs.existsSync(from0)) {
  throw new Error('Missing file icon bundle: ' + from0)
}
cp('-r', from0, to2)
