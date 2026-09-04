import { auto } from 'manate/react'
import { Dropdown } from 'antd'
import {
  PlusOutlined,
  MoreOutlined,
  CloseOutlined,
  UpOutlined,
  DownOutlined
} from '@ant-design/icons'
import './easyssh.styl'

/**
 * EasySSH Terminal Chrome —— 多终端横条（替代 electerm SessionControl）
 * 只负责 tab 切换/新建/折叠/低频菜单；xterm/session 完全复用 electerm。
 */
export default auto(function EasySshTerminalChrome (props) {
  const { store, bm, height, collapsed, maximized, onToggleCollapse, onToggleMaximize } = props
  if (!bm) {
    return null
  }
  // 该服务器的终端类 tabs
  const termTabs = store.tabs.filter(t => t.srcId === bm.id)
  const activeId = store.activeTabId

  const newTerminal = () => {
    // 复用 electerm 现有创建流程（同 dashboard Terminal 按钮）
    store.onSelectBookmark(bm.id)
  }

  const closeTab = (id) => {
    store.delTab(id)
  }

  // ··· 菜单：低频功能（Clear/Search/Encoding 等后续接入 electerm 现有 action）
  const moreItems = [
    { key: 'new', label: 'New Terminal' },
    { key: 'close', label: 'Close Current Terminal' }
  ]
  const onMoreClick = ({ key }) => {
    if (key === 'new') {
      newTerminal()
    } else if (key === 'close') {
      closeTab(activeId)
    }
  }

  return (
    <div className='easyssh-term-chrome' style={{ height: height + 'px' }}>
      {termTabs.map((tab, i) => (
        <span
          key={tab.id}
          className={'easyssh-term-tab' + (tab.id === activeId ? ' active' : '')}
          onClick={() => { store.activeTabId = tab.id }}
          title={tab.title || ('Terminal ' + (i + 1))}
        >
          Terminal {i + 1}
          <CloseOutlined
            className='easyssh-term-tab-close'
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
          />
        </span>
      ))}
      <span className='easyssh-term-tab-add' onClick={newTerminal} title='New Terminal'>
        <PlusOutlined />
      </span>
      <span className='easyssh-term-spacer' />
      {!collapsed && (
        <span
          className={'easyssh-term-action' + (maximized ? ' active' : '')}
          onClick={onToggleMaximize}
          title={maximized ? 'Restore split' : 'Maximize terminal'}
        >
          {maximized ? <DownOutlined /> : <UpOutlined />}
        </span>
      )}
      <span
        className='easyssh-term-action'
        onClick={onToggleCollapse}
        title={collapsed ? 'Restore terminal' : 'Collapse terminal'}
      >
        {collapsed ? <UpOutlined /> : <DownOutlined />}
      </span>
      <Dropdown
        menu={{ items: moreItems, onClick: onMoreClick }}
        trigger={['click']}
      >
        <span className='easyssh-term-more' title='More'>
          <MoreOutlined />
        </span>
      </Dropdown>
    </div>
  )
})
