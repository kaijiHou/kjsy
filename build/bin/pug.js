// build html
/**
 * build common files with react module in it
 */
const fs = require('fs')
const pug = require('pug')
const { resolve } = require('path')
const pack = require('../../package.json')
const deepCopy = require('json-deep-copy')

const entryPug = resolve(
  __dirname,
  '../../src/client/views/index.pug'
)
const targetFilePath = resolve(
  __dirname,
  '../../work/app/assets/index.html'
)
const pugContent = fs.readFileSync(entryPug, 'utf-8')
const defaultAIPreset = {
  baseURLAI: '',
  apiPathAI: '/chat/completions',
  modelAI: 'mistral-small-latest',
  authHeaderNameAI: 'Authorization: ***',
  id: 'easyssh.local',
  nameAI: 'EasySSH AI (disabled)'
}

// const AIDisclamer = 'AI-generated terminal commands can be inaccurate or unsafe, be careful'

const data = {
  version: pack.version,
  siteName: 'EasySSH',
  isDev: false,
  defaultAIPreset,
  disableUpgradeCheck: true
}
const htmlContent = pug.render(pugContent, {
  filename: entryPug,
  ...data,
  _global: deepCopy(data)
})
fs.writeFileSync(targetFilePath, htmlContent, 'utf8')
