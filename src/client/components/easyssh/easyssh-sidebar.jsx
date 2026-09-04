import { auto } from 'manate/react'
import {
  PlusOutlined,
  SettingOutlined,
  CloudUploadOutlined
} from '@ant-design/icons'
import { PRODUCT_NAME } from '../../common/product'
import { getServerState, STATE_META } from '../../common/easyssh-utils'
import './easyssh.styl'

function ServerItem ({ store, bm, active }) {
  const { state } = getServerState(store, bm)
  const meta = STATE_META[state]
  const sub = bm.easysshGpuModel
    ? `${bm.easysshGpuModel}${bm.easysshGpuCount ? ' × ' + bm.easysshGpuCount : ''}`
    : (bm.username ? bm.username + '@' + bm.host : bm.host)
  return (
    <div
      className={'easyssh-server-item' + (active ? ' active' : '')}
      onClick={() => store.easysshOpenServer(bm)}
      title={`${bm.host}:${bm.port || 22}`}
    >
      <span className={'easyssh-server-dot ' + meta.cls}>{meta.dot}</span>
      <span className='easyssh-server-text'>
        <span className='easyssh-server-name'>{bm.title || bm.host}</span>
        <span className='easyssh-server-sub'>{sub}</span>
      </span>
    </div>
  )
}

export default auto(function EasySshSidebar (props) {
  const { store, servers, activeId, height } = props
  const transfers = store.fileTransfers || []
  return (
    <div className='easyssh-sidebar' style={{ height: height + 'px' }}>
      <div className='easyssh-brand'>{PRODUCT_NAME}</div>
      <div className='easyssh-sidebar-label'>SERVERS</div>
      <div className='easyssh-server-list'>
        {servers.map(bm => (
          <ServerItem
            key={bm.id}
            store={store}
            bm={bm}
            active={bm.id === activeId}
          />
        ))}
      </div>
      <button
        className='easyssh-add-server'
        onClick={() => store.onNewSsh()}
      >
        <PlusOutlined /> Add Server
      </button>
      <div className='easyssh-sidebar-footer'>
        <div
          className='easyssh-footer-item'
          onClick={() => store.setOpenedSideBar('transfer')}
          title='Transfers'
        >
          <CloudUploadOutlined />
          <span>Transfers</span>
          {transfers.length > 0 && (
            <span className='easyssh-footer-badge'>{transfers.length}</span>
          )}
        </div>
        <div
          className='easyssh-footer-item'
          onClick={() => store.openSetting()}
          title='Settings'
        >
          <SettingOutlined />
          <span>Settings</span>
        </div>
      </div>
    </div>
  )
})
