import { packInfo } from '../../common/constants'
import { Tag } from 'antd'
import './logo.styl'

// EasySSH 文本 logo（替代 upstream electerm 图片 logo）
export default function LogoElem () {
  return (
    <h1 className='logo-elem mg3y font50'>
      <span className='easyssh-about-logo'>EasySSH</span>
      <Tag color='#08c' variant='solid'>{packInfo.version}</Tag>
    </h1>
  )
}
