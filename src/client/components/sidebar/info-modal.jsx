import {
  InfoCircleOutlined
} from '@ant-design/icons'
import { Tabs, Button } from 'antd'
import Modal from '../common/modal'
import LogoElem from '../common/logo-elem'
import Placeholder from '../common/placeholder'
import RunningTime from './app-running-time'
import { auto } from 'manate/react'
import { useState } from 'react'

import {
  packInfo,
  infoTabs
} from '../../common/constants'
import { checkSkipSrc } from '../../common/check-skip-src'
import './info.styl'

const e = window.translate

export default auto(function InfoModal (props) {
  const [runtimeEnv, setRuntimeEnv] = useState(null)

  const handleChangeTab = key => {
    window.store.infoModalTab = key
    if (key === infoTabs.env && !runtimeEnv) {
      window.pre.runGlobalAsync('getEnv').then(env => setRuntimeEnv(env))
    }
  }

  const renderCheckUpdate = () => {
    if (window.et.disableUpgradeCheck || checkSkipSrc(props.installSrc)) {
      return null
    }
    const {
      onCheckUpdate
    } = window.store
    const {
      upgradeInfo
    } = props
    const onCheckUpdating = upgradeInfo.checkingRemoteVersion || upgradeInfo.upgrading
    const { noUpdateMessage, noUpdateMessageExpires } = upgradeInfo
    const showMessage = noUpdateMessage && noUpdateMessageExpires && Date.now() < noUpdateMessageExpires
    return (
      <div className='mg1b mg2t'>
        <Button
          type='primary'
          loading={onCheckUpdating}
          onClick={() => onCheckUpdate(true)}
        >
          {e('checkForUpdate')}
        </Button>
        {showMessage && (
          <span className='mg1l update-msg'>{noUpdateMessage}</span>
        )}
      </div>
    )
  }

  const renderParsed = (obj, depth = 0) => {
    if (Array.isArray(obj)) {
      return (
        <ul className='pd2l'>
          {obj.map((item, i) => (
            <li key={i}>{renderParsed(item, depth + 1)}</li>
          ))}
        </ul>
      )
    } else if (typeof obj === 'object' && obj !== null) {
      return (
        <div className={depth > 0 ? 'pd2l' : ''}>
          {Object.entries(obj).map(([k, v]) => (
            <div key={k} className='pd1b'>
              <b>{k}:</b> {renderParsed(v, depth + 1)}
            </div>
          ))}
        </div>
      )
    } else {
      return <span>{String(obj)}</span>
    }
  }

  const renderValue = (v) => {
    try {
      const parsed = JSON.parse(v)
      return renderParsed(parsed)
    } catch {
      return <span>{v}</span>
    }
  }

  const renderOSInfo = () => {
    return window.pre.osInfo().map(({ k, v }, i) => (
      <div className='pd1b' key={i + '_os_' + k}>
        <b className='bold'>{k}:</b>
        <span className='mg1l'>
          {renderValue(v)}
        </span>
      </div>
    ))
  }

  const { infoModalTab, commandLineHelp } = props
  const {
    showInfoModal
  } = window.store
  function onCloseAbout () {
    window.store.showInfoModal = false
  }
  if (!showInfoModal) {
    return null
  }
  const {
    // description,
    devDependencies,
    dependencies
  } = packInfo
  const { versions } = window.pre
  const deps = {
    ...devDependencies,
    ...dependencies
  }
  const envs = {
    ...versions,
    ...(runtimeEnv || {})
  }
  const title = (
    <div className='custom-modal-close-confirm-title font16'>
      <InfoCircleOutlined className='font20 mg1r' /> {e('about')} EasySSH Desktop
    </div>
  )
  const attrs = {
    title,
    width: window.innerWidth - 100,
    maskClosable: true,
    onCancel: onCloseAbout,
    open: true,
    wrapClassName: 'info-modal'
  }
  const items = [
    {
      key: infoTabs.info,
      label: e('about'),
      children: (
        <>
          <LogoElem />
          <p className='mg2b'>{e('desc')}</p>
          <RunningTime />
          <p className='mg1b'>
            <InfoCircleOutlined /> <b className='mg1r'>{window.store.installSrc}</b>
          </p>
          {renderCheckUpdate()}
          <Placeholder />
        </>
      )
    },
    {
      key: infoTabs.deps,
      label: e('dependencies'),
      children: Object.keys(deps).map((k, i) => {
        const v = deps[k]
        return (
          <div className='pd1b' key={i + '_dp_' + k}>
            <b className='bold'>{k}</b>:
            <span className='mg1l'>
              {v}
            </span>
          </div>
        )
      })
    },
    {
      key: infoTabs.env,
      label: e('env'),
      children: Object.keys(envs).map((k, i) => {
        const v = envs[k]
        return (
          <div className='pd1b' key={i + '_env_' + k}>
            <b className='bold'>{k}</b>:
            <span className='mg1l'>
              {v}
            </span>
          </div>
        )
      })
    },
    {
      key: infoTabs.os,
      label: e('os'),
      children: <div>{renderOSInfo()}</div>
    }
  ]

  if (!window.et.isWebApp) {
    items.push({
      key: infoTabs.cmd,
      label: e('commandLineUsage'),
      children: (
        <pre>
          <code>{commandLineHelp}</code>
        </pre>
      )
    })
  }

  return (
    <Modal
      {...attrs}
    >
      <div className='about-wrap'>
        <Tabs
          activeKey={infoModalTab}
          onChange={handleChangeTab}
          items={items}
        />
      </div>
    </Modal>
  )
})
