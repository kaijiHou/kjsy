/**
 * init app data then write main script to html body
 */
import '../css/basic.styl'
import '../css/mobile.styl'
import { get as _get } from 'lodash-es'
import '../common/pre'

const { isDev } = window.et
const { version } = window.pre.packInfo

async function loadWorker () {
  return new Promise((resolve) => {
    const url = !isDev ? `js/worker-${version}.js` : 'js/worker.js'
    window.worker = new window.Worker(url)
    function onInit (e) {
      if (!e || !e.data) {
        return false
      }
      const {
        action
      } = e.data
      if (action === 'worker-init') {
        window.worker.removeEventListener('message', onInit)
        resolve(1)
      }
    }
    window.worker.addEventListener('message', onInit)
  })
}

async function load () {
  window.capitalizeFirstLetter = (string) => {
    return string.charAt(0).toUpperCase() + string.slice(1)
  }
  function loadScript () {
    const rcs = document.createElement('script')
    const url = !isDev ? `js/electerm-${version}.js` : 'js/electerm.js'
    rcs.src = url
    rcs.type = 'module'
    rcs.onload = () => {
      const loadingEl = document.getElementById('content-loading')
      if (loadingEl) {
        document.body.removeChild(loadingEl)
      }
    }
    document.body.appendChild(rcs)
  }
  const initLocale = window.pre.runSync('getInitLocale') || {}
  window.langMap = initLocale.langMap
  window.initLanguage = initLocale.language
  window.getLang = (lang = window.store?.config.language || window.initLanguage || 'en_us') => {
    return _get(window.langMap, `[${lang}].lang`)
  }
  window.translate = txt => {
    const lang = window.getLang()
    const str = _get(lang, `[${txt}]`) || txt
    // EasySSH 用户术语收口：用户可见文案统一 Connection/连接
    // （内部 bookmark model/store/schema 完全不动）
    const zh = window.initLanguage ? window.initLanguage.startsWith('zh') : false
    const easysshTerms = {
      bookmarks: zh ? '连接' : 'Connection',
      bookmarkCategory: zh ? '连接分类' : 'Connection Category',
      newBookmark: zh ? '新建连接' : 'New Connection',
      chooseFromBookmarks: zh ? '从连接中选择' : 'Choose from Connections',
      createBookmarkByAI: zh ? 'AI 智能创建连接' : 'Create Connection with AI',
      openAll: zh ? '在此类别中打开所有连接' : 'Open all connections in this category',
      onStartBookmarks: zh ? '在启动时打开连接' : 'Open connections on startup',
      toggleAddBtn: zh ? '切换连接搜索' : 'Toggle connection search',
      addressBookmarks: zh ? '地址连接' : 'Address Connections',
      syncDesc: zh ? '把连接/历史/系统设置同步到 Github 的私有 Gist' : 'Sync connections/history/settings to a private Github Gist'
    }
    if (easysshTerms[txt]) {
      return easysshTerms[txt]
    }
    return window.capitalizeFirstLetter(str)
  }
  await loadWorker()
  loadScript()
}

// window.addEventListener('load', load)
load()
