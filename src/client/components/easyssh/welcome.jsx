import { auto } from 'manate/react'
import { Button } from 'antd'
import { PlusOutlined, DesktopOutlined } from '@ant-design/icons'
import './easyssh.styl'

/**
 * Welcome / Connection Entry Page：
 * - 0 连接：Primary CTA「+ Create Connection」+ 需要准备的字段提示
 * - 有连接：Recent Connections（可点击条目）+「+ New」入口
 * 创建统一走 store.onNewSsh()（现有 bookmark 表单，无第二套数据模型）
 */
export default auto(function Welcome (props) {
  const { store, height, onNewSsh } = props
  const servers = store.bookmarks.filter(b => b.type === 'ssh')
  const recent = servers.slice(0, 6)
  const create = onNewSsh || (() => store.onNewSsh())
  return (
    <div className='easyssh-welcome' style={{ height: height + 'px' }}>
      <div className='easyssh-welcome-inner'>
        <div className='easyssh-welcome-title'>Welcome to EasySSH</div>
        {recent.length === 0
          ? (
            <>
              <div className='easyssh-welcome-sub'>Connect to a remote Linux server using SSH.</div>
              <Button
                type='primary'
                size='large'
                icon={<PlusOutlined />}
                onClick={create}
                className='easyssh-welcome-cta'
              >
                Create Connection
              </Button>
              <div className='easyssh-welcome-hint'>
                You&apos;ll need:
                <span>Host / IP</span>
                <span>SSH Port</span>
                <span>Username</span>
                <span>Password or private key</span>
              </div>
            </>
            )
          : (
            <>
              <div className='easyssh-welcome-sub'>Connect to your remote server workspace.</div>
              <div className='easyssh-recent'>
                <div className='easyssh-recent-header'>
                  <div className='easyssh-recent-label'>Recent Connections</div>
                  <Button
                    size='small'
                    icon={<PlusOutlined />}
                    onClick={create}
                    className='easyssh-recent-new'
                  >
                    New
                  </Button>
                </div>
                {recent.map(bm => (
                  <div
                    className='easyssh-recent-item'
                    key={bm.id}
                    onClick={() => store.easysshOpenServer(bm)}
                  >
                    <DesktopOutlined className='easyssh-recent-icon' />
                    <div className='easyssh-recent-main'>
                      <div className='easyssh-recent-name'>{bm.title || bm.host}</div>
                      <div className='easyssh-recent-sub'>{bm.username ? bm.username + '@' : ''}{bm.host}:{bm.port || 22}</div>
                    </div>
                  </div>
                ))}
                <Button
                  type='dashed'
                  block
                  icon={<PlusOutlined />}
                  onClick={create}
                  className='easyssh-recent-add'
                >
                  Create another connection
                </Button>
              </div>
            </>
            )}
      </div>
    </div>
  )
})
