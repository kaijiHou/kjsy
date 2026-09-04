import { auto } from 'manate/react'
import { paneMap } from '../../common/constants'
import { getServerState, STATE_META } from '../../common/easyssh-utils'
import './easyssh.styl'

/**
 * Workspace Header：始终显示当前操作的服务器 + 状态 + 工具切换
 */
export default auto(function WorkspaceHeader (props) {
  const { store, bm } = props
  if (!bm) {
    return (
      <div className='easyssh-header'>
        <div className='easyssh-header-left'>
          <div className='easyssh-header-title'>EasySSH</div>
          <div className='easyssh-header-sub'>Select a server to open its workspace</div>
        </div>
      </div>
    )
  }
  const { state, tabs } = getServerState(store, bm)
  const meta = STATE_META[state]
  const activePane = tabs.length ? tabs[0].pane : null
  const isFiles = activePane === paneMap.fileManager
  return (
    <div className='easyssh-header'>
      <div className='easyssh-header-left'>
        <div className='easyssh-header-title'>
          {bm.title || bm.host}
          <span className={'easyssh-header-state ' + meta.cls}>
            {meta.dot} {meta.label}
          </span>
        </div>
        <div className='easyssh-header-sub'>
          {bm.username}@{bm.host}:{bm.port || 22}
        </div>
      </div>
      <div className='easyssh-header-tools'>
        <button
          className={'easyssh-tool-btn' + (!isFiles ? ' active' : '')}
          onClick={() => store.easysshOpenTerminal(bm)}
        >
          Terminal
        </button>
        <button
          className={'easyssh-tool-btn' + (isFiles ? ' active' : '')}
          onClick={() => store.easysshOpenFiles(bm)}
        >
          Files
        </button>
        <button className='easyssh-tool-btn easyssh-tool-btn-disabled' disabled title='Coming soon'>
          Monitor
        </button>
      </div>
    </div>
  )
})
