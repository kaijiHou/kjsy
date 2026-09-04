import { createRoot } from 'react-dom/client'
import 'antd/dist/reset.css'
import '@fontsource/maple-mono/index.css'
import Main from '../components/main/index.jsx'
import pkg from '../../../package.json'

// 开发模式 BUILD ID：确认运行窗口与源码/构建对应（正式版可移除）
if (import.meta.env.DEV) {
  console.info(`[EasySSH Build] v${pkg.version} dev build — window identity check`)
}

const rootElement = createRoot(document.getElementById('container'))
rootElement.render(
  <Main />
)
